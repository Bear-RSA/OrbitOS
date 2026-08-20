import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

import { resolveTaskReminderLimit } from "@/lib/auth/permissions";
import { sendTaskReminder, type ReminderTask } from "@/lib/email/sendTaskReminder";
import { dueDateKeyOf } from "@/lib/utils/dates";
import { resolvePreferences } from "@/types/preferences";

/* ------------------------------------------------------------------ */
/*  Due-soon task reminders                                            */
/*                                                                     */
/*  Runs once a day and mails every assignee whose work falls due the  */
/*  NEXT calendar day. Work with NOBODY assigned goes to the workspace */
/*  owner instead: an unclaimed task due tomorrow is a planning gap,   */
/*  and the owner is the one person positioned to hand it to somebody  */
/*  before the day arrives.                                            */
/*                                                                     */
/*  "24 hours before" is exact rather than approximate, and that is a  */
/*  property of the cron time, not of this module. A due date is a     */
/*  calendar day stored as midday UTC (`dateKeyToInstant`), so a run   */
/*  at 12:00 UTC on day D reaches everyone whose tasks are due on D+1  */
/*  exactly 24 hours out. Move the schedule in vercel.json and the     */
/*  lead time moves with it — the selection stays "due tomorrow".      */
/*                                                                     */
/*  Idempotency lives on the task as `dueReminderSentFor`, holding the */
/*  due-date key already reminded about. A re-run of the same day is a */
/*  no-op; moving a task to a different day makes the value stale and  */
/*  earns a fresh reminder.                                            */
/* ------------------------------------------------------------------ */

/**
 * Hard ceilings. ALWAYS on, independent of BILLING_GUARDRAILS_ENABLED,
 * because every reminder is a Resend send charged to us. A tier may narrow
 * an org below these (`resolveTaskReminderLimit`); nothing widens them.
 */
const HARD_MAX_PER_ORG = 200;
const HARD_MAX_PER_RUN = 1000;

/** Sent in bounded waves so a busy day does not trip Resend's rate limit. */
const WAVE_SIZE = 8;

/** A reminder listing forty tasks is a wall, not a prompt. */
const MAX_TASKS_LISTED = 25;

export interface ReminderRunResult {
  /** The due-date key reminded about — the day after the run. */
  targetDateKey: string;
  /** Tasks due that day, after status and already-sent filtering. */
  candidates: number;
  emailsSent: number;
  emailsFailed: number;
  /** Recipients dropped, with the reason. Cheap to read in cron logs. */
  skipped: string[];
}

interface PendingMessage {
  orgId: string;
  uid: string;
  email: string;
  name: string;
  orgName: string;
  /** Uncapped — ordered and trimmed to MAX_TASKS_LISTED at send time. */
  tasks: ReminderTask[];
  /** Every task id this message covers, including any trimmed for length. */
  taskIds: string[];
}

/** The assignees of a stored task, tolerating a missing or ragged field. */
function assigneesOf(task: FirebaseFirestore.DocumentData): string[] {
  if (!Array.isArray(task.assignedTo)) return [];
  return task.assignedTo.filter(
    (uid: unknown): uid is string => typeof uid === "string" && uid.length > 0
  );
}

/**
 * Orders a reminder for reading: unassigned first, since those need
 * somebody to ACT rather than merely to know, then alphabetically so the
 * same list arrives in the same order every time.
 */
function orderForEmail(tasks: ReminderTask[]): ReminderTask[] {
  return [...tasks].sort((a, b) => {
    if (a.unassigned !== b.unassigned) return a.unassigned ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

/**
 * The owner an unassigned task falls to.
 *
 * A workspace may have several owners (up to five on the top tier), so this
 * picks the earliest by `createdAt` — the person who created the workspace
 * — rather than whichever document the query happened to return first. A
 * recipient that rotates between runs makes the reminder feel random, and
 * mailing every owner about one unclaimed task is noise, not redundancy.
 *
 * Two equality filters and no ordering, so Firestore serves this from
 * single-field indexes; the ranking happens here rather than in an
 * `orderBy` that would demand a composite index.
 */
async function resolveFallbackOwner(
  orgId: string
): Promise<{ uid: string; data: FirebaseFirestore.DocumentData } | null> {
  const snap = await adminDb
    .collection("users")
    .where("orgId", "==", orgId)
    .where("role", "==", "OWNER")
    .get();

  if (snap.empty) return null;

  const ranked = [...snap.docs].sort((a, b) => {
    const aCreated = a.data().createdAt?.toMillis?.() ?? 0;
    const bCreated = b.data().createdAt?.toMillis?.() ?? 0;
    if (aCreated !== bCreated) return aCreated - bCreated;
    return a.id.localeCompare(b.id);
  });

  return { uid: ranked[0].id, data: ranked[0].data() };
}

/** The calendar-day key of the day after `now`, read in UTC. */
function nextDayKey(now: Date): string {
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  return day.toISOString().slice(0, 10);
}

/** Midnight-to-midnight UTC bounds of a "YYYY-MM-DD" key. */
function utcDayBounds(key: string): { start: Date; end: Date } {
  const [y, m, d] = key.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, d)),
    end: new Date(Date.UTC(y, m - 1, d + 1)),
  };
}

async function getAllByIds(
  collection: string,
  ids: string[]
): Promise<Map<string, FirebaseFirestore.DocumentData>> {
  const found = new Map<string, FirebaseFirestore.DocumentData>();
  if (ids.length === 0) return found;

  // getAll is a single round trip but takes one ref per document, so it is
  // chunked rather than handed a list of unbounded length.
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids
      .slice(i, i + 100)
      .map((id) => adminDb.collection(collection).doc(id));
    const snaps = await adminDb.getAll(...refs);
    for (const snap of snaps) {
      if (snap.exists) found.set(snap.id, snap.data()!);
    }
  }

  return found;
}

/**
 * Collects the tasks due on `targetKey`.
 *
 * Two queries, merged. The range on `dueDate` is what catches documents
 * written before `dueDateKey` existed (those landed on UTC midnight, current
 * ones on UTC midday — both inside the same UTC day). The equality on
 * `dueDateKey` catches anything whose key and Timestamp have drifted apart,
 * since the key is the authority on the day. Both are single-field queries,
 * so neither needs a composite index.
 */
async function fetchTasksDueOn(
  targetKey: string
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const { start, end } = utcDayBounds(targetKey);

  const [byInstant, byKey] = await Promise.all([
    adminDb
      .collection("tasks")
      .where("dueDate", ">=", Timestamp.fromDate(start))
      .where("dueDate", "<", Timestamp.fromDate(end))
      .get(),
    adminDb.collection("tasks").where("dueDateKey", "==", targetKey).get(),
  ]);

  const merged = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const doc of [...byInstant.docs, ...byKey.docs]) merged.set(doc.id, doc);
  return [...merged.values()];
}

/**
 * Sends the reminders for one run.
 *
 * `dryRun` does every lookup and every filter but sends nothing and marks
 * nothing — the way to see what the next run would do without spending a
 * send on it.
 */
export async function runDueTaskReminders(options?: {
  now?: Date;
  dryRun?: boolean;
}): Promise<ReminderRunResult> {
  const now = options?.now ?? new Date();
  const dryRun = options?.dryRun ?? false;
  const targetDateKey = nextDayKey(now);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit-os.co.za";
  const skipped: string[] = [];

  const docs = await fetchTasksDueOn(targetDateKey);

  // The key is the authority on the day, so the range query's catch is
  // re-checked against it rather than trusted.
  const candidates = docs.filter((doc) => {
    const task = doc.data();
    if (task.status === "done") return false;
    if (dueDateKeyOf(task) !== targetDateKey) return false;
    return task.dueReminderSentFor !== targetDateKey;
  });

  if (candidates.length === 0) {
    return {
      targetDateKey,
      candidates: 0,
      emailsSent: 0,
      emailsFailed: 0,
      skipped,
    };
  }

  const uids = new Set<string>();
  const orgIds = new Set<string>();
  const projectIds = new Set<string>();
  const orgsNeedingOwner = new Set<string>();

  for (const doc of candidates) {
    const task = doc.data();
    const assignees = assigneesOf(task);

    for (const uid of assignees) uids.add(uid);
    if (assignees.length === 0 && task.orgId) orgsNeedingOwner.add(task.orgId);
    if (task.orgId) orgIds.add(task.orgId);
    if (task.projectId) projectIds.add(task.projectId);
  }

  const [users, orgs, projects] = await Promise.all([
    getAllByIds("users", [...uids]),
    getAllByIds("organizations", [...orgIds]),
    getAllByIds("projects", [...projectIds]),
  ]);

  // Only for orgs that actually have unclaimed work due — a workspace with
  // everything assigned never pays for this lookup.
  const fallbackOwners = new Map<string, string>();

  await Promise.all(
    [...orgsNeedingOwner].map(async (orgId) => {
      const owner = await resolveFallbackOwner(orgId);
      if (!owner) return;
      fallbackOwners.set(orgId, owner.uid);
      // Folded into the same map so the recipient loop below has one path.
      users.set(owner.uid, owner.data);
    })
  );

  /* ---------------------------------------------------------------- */
  /*  Group by recipient — one mail per person, not one per task.      */
  /* ---------------------------------------------------------------- */

  const messages = new Map<string, PendingMessage>();
  const droppedUids = new Set<string>();
  const ownerlessOrgs = new Set<string>();

  for (const doc of candidates) {
    const task = doc.data();
    const assignees = assigneesOf(task);
    const unassigned = assignees.length === 0;

    let recipients = assignees;

    if (unassigned) {
      const ownerUid = fallbackOwners.get(task.orgId);

      // An org with no OWNER document has nobody to escalate to. Logged
      // once rather than per task, since the cause is the same every time.
      if (!ownerUid) {
        if (!ownerlessOrgs.has(task.orgId)) {
          ownerlessOrgs.add(task.orgId);
          skipped.push(`${task.orgId} (unassigned work due, no owner to notify)`);
        }
        continue;
      }

      recipients = [ownerUid];
    }

    for (const uid of recipients) {
      const user = users.get(uid);

      if (!user?.email) {
        if (!droppedUids.has(uid)) {
          droppedUids.add(uid);
          skipped.push(`${uid} (no user record or no email)`);
        }
        continue;
      }

      // Settings -> Notifications. Checked before the message is built so an
      // opted-out person costs nothing beyond the read that found them.
      if (!resolvePreferences(user.preferences).taskReminders) {
        if (!droppedUids.has(uid)) {
          droppedUids.add(uid);
          skipped.push(`${user.email} (reminders disabled)`);
        }
        continue;
      }

      // A task belongs to an org; someone since moved to another workspace
      // should not receive its work.
      if (user.orgId && task.orgId && user.orgId !== task.orgId) {
        if (!droppedUids.has(uid)) {
          droppedUids.add(uid);
          skipped.push(`${user.email} (assigned outside their org)`);
        }
        continue;
      }

      const groupKey = `${task.orgId}::${uid}`;
      let message = messages.get(groupKey);

      if (!message) {
        message = {
          orgId: task.orgId,
          uid,
          email: user.email,
          name: user.name || user.email,
          orgName: orgs.get(task.orgId)?.name ?? "your workspace",
          tasks: [],
          taskIds: [],
        };
        messages.set(groupKey, message);
      }

      message.taskIds.push(doc.id);
      message.tasks.push({
        id: doc.id,
        title: task.title ?? "Untitled task",
        projectName: projects.get(task.projectId)?.name ?? null,
        dueDateKey: targetDateKey,
        status: task.status === "doing" ? "doing" : "todo",
        isBlocked: Boolean(task.isBlocked),
        unassigned,
        url: `${appUrl}/projects/${task.projectId}`,
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Ceilings — tier first, hard ceiling always.                      */
  /* ---------------------------------------------------------------- */

  const perOrg = new Map<string, PendingMessage[]>();
  for (const message of messages.values()) {
    const bucket = perOrg.get(message.orgId);
    if (bucket) bucket.push(message);
    else perOrg.set(message.orgId, [message]);
  }

  const allowed: PendingMessage[] = [];

  for (const [orgId, bucket] of perOrg) {
    const tierLimit = await resolveTaskReminderLimit(orgId);
    const limit =
      tierLimit === -1 ? HARD_MAX_PER_ORG : Math.min(tierLimit, HARD_MAX_PER_ORG);

    // Deterministic, so a truncated org keeps reaching the same people
    // rather than a different subset every night.
    bucket.sort((a, b) => a.email.localeCompare(b.email));

    if (bucket.length > limit) {
      skipped.push(
        `${orgId}: ${bucket.length - limit} recipient(s) over the ${limit}/day reminder ceiling`
      );
    }

    allowed.push(...bucket.slice(0, limit));
  }

  const queue = allowed.slice(0, HARD_MAX_PER_RUN);
  if (allowed.length > queue.length) {
    skipped.push(
      `${allowed.length - queue.length} recipient(s) over the ${HARD_MAX_PER_RUN}/run global ceiling`
    );
  }

  if (dryRun) {
    return {
      targetDateKey,
      candidates: candidates.length,
      emailsSent: 0,
      emailsFailed: 0,
      skipped: [...skipped, `dry run — ${queue.length} email(s) withheld`],
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Send, then mark.                                                 */
  /* ---------------------------------------------------------------- */

  let emailsSent = 0;
  let emailsFailed = 0;

  // A task is only marked once every message carrying it went out. One
  // recipient failing must not silence the reminder for the other.
  const delivered = new Set<string>();
  const failedTasks = new Set<string>();

  for (let i = 0; i < queue.length; i += WAVE_SIZE) {
    const wave = queue.slice(i, i + WAVE_SIZE);

    const results = await Promise.all(
      wave.map((message) => {
        const ordered = orderForEmail(message.tasks);

        return sendTaskReminder({
          recipient: { name: message.name, email: message.email },
          orgName: message.orgName,
          tasks: ordered.slice(0, MAX_TASKS_LISTED),
          additionalCount: Math.max(0, ordered.length - MAX_TASKS_LISTED),
          dueDateKey: targetDateKey,
          dashboardUrl: `${appUrl}/dashboard`,
        });
      })
    );

    results.forEach((result, index) => {
      const message = wave[index];
      if (result.success) {
        emailsSent += 1;
        for (const taskId of message.taskIds) delivered.add(taskId);
      } else {
        emailsFailed += 1;
        skipped.push(`${message.email} (send failed: ${result.error})`);
        for (const taskId of message.taskIds) failedTasks.add(taskId);
      }
    });
  }

  const toMark = [...delivered].filter((taskId) => !failedTasks.has(taskId));

  for (let i = 0; i < toMark.length; i += 400) {
    const batch = adminDb.batch();
    for (const taskId of toMark.slice(i, i + 400)) {
      // Only the reminder field. Touching `updatedAt`/`lastUpdatedAt` here
      // would tell the digest's inactivity check that a stalled task had
      // just been worked on.
      batch.update(adminDb.collection("tasks").doc(taskId), {
        dueReminderSentFor: targetDateKey,
      });
    }
    await batch.commit();
  }

  return {
    targetDateKey,
    candidates: candidates.length,
    emailsSent,
    emailsFailed,
    skipped,
  };
}
