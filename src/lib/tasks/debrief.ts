import { adminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { resolveDebriefAllowance } from "@/lib/auth/permissions";
import {
  debriefTotal,
  sendDailyDebrief,
  type DailyDebriefSections,
  type DebriefEntry,
  type DebriefTrial,
} from "@/lib/email/sendDailyDebrief";
import { sastDayKey, sastInstant } from "@/lib/utils/sast";
import { resolvePreferences } from "@/types/preferences";

/* ------------------------------------------------------------------ */
/*  End-of-day debrief                                                 */
/*                                                                     */
/*  Runs at 18:00 SAST and mails each person a summary of their own    */
/*  day: what they opened, what they were handed, what they moved and  */
/*  what they closed.                                                  */
/*                                                                     */
/*  Read from the `activity` collection rather than from tasks. A task */
/*  document holds current state and no history, so "moved to doing    */
/*  this morning, then blocked at noon" exists nowhere else. That is   */
/*  also why the four task events are logged on the server write path  */
/*  in `actions/tasks.ts` — a missed event here cannot be recovered    */
/*  from anywhere.                                                     */
/*                                                                     */
/*  WINDOW — rolling 18:00 to 18:00, not midnight to 18:00.            */
/*  A midnight-to-18:00 window silently drops everything done in the   */
/*  evening: it falls after today's cutoff and before tomorrow's       */
/*  start, so no debrief ever reports it. Rolling the window back to   */
/*  the previous run's cutoff means every event lands in exactly one   */
/*  debrief, and late work shows up the following evening instead of   */
/*  vanishing. The day the mail NAMES is still the calendar day it is  */
/*  sent on, which is how the recipient will read it.                  */
/* ------------------------------------------------------------------ */

/** The SAST wall-clock hour the debrief goes out, and so the window edge. */
const CUTOFF_HOUR = 18;

/**
 * Hard ceiling, always on. Every debrief is a Resend invoice charged to us.
 *
 * This is the second of two layers, and it answers a different question from
 * the first. `lifetimeDebriefs` on the tier decides who is entitled to a
 * debrief at all; this decides how many go out in one evening regardless of
 * entitlement. A workspace on an unlimited plan has no per-recipient limit
 * left to stop a pathological day, so the ceiling stays conservative and
 * stays independent of the tier.
 *
 * A run that exceeds it reports the shortfall in `skipped` rather than
 * truncating quietly.
 */
const HARD_MAX_PER_RUN = 500;

/** Sent in bounded waves so a busy day does not trip Resend's rate limit. */
const WAVE_SIZE = 8;

/** Activity documents read in one run. A cap, not an expectation. */
const MAX_EVENTS = 20000;

export interface DebriefRunResult {
  /** The SAST calendar day the mail is named for. */
  dayKey: string;
  /** ISO bounds of the window actually read. */
  window: { from: string; to: string };
  eventsScanned: number;
  /** People with at least one event in the window. */
  candidates: number;
  emailsSent: number;
  emailsFailed: number;
  skipped: string[];
}

interface PendingDebrief {
  uid: string;
  email: string;
  name: string;
  orgId: string;
  orgName: string;
  sections: DailyDebriefSections;
  /** Present only while the recipient's tier meters the debrief. */
  trial?: DebriefTrial;
}

/** Per-user accumulator, keyed by task id so one task cannot appear twice. */
interface Bucket {
  created: Map<string, DebriefEntry>;
  assigned: Map<string, DebriefEntry>;
  moved: Map<string, MovedEntry>;
  completed: Map<string, DebriefEntry>;
  orgId: string;
}

/** A task moved more than once collapses into the day's net movement. */
interface MovedEntry extends DebriefEntry {
  firstFrom: string | null;
  lastTo: string | null;
}

function emptyBucket(orgId: string): Bucket {
  return {
    created: new Map(),
    assigned: new Map(),
    moved: new Map(),
    completed: new Map(),
    orgId,
  };
}

/**
 * A stable identity for an event's task.
 *
 * `taskId` is written by the server-side hooks; entries logged before those
 * existed carry only a title, which is still enough to group and display.
 */
function taskKeyOf(metadata: Record<string, any>): string | null {
  if (typeof metadata.taskId === "string" && metadata.taskId) {
    return metadata.taskId;
  }
  if (typeof metadata.taskTitle === "string" && metadata.taskTitle) {
    return `title:${metadata.taskTitle}`;
  }
  return null;
}

function entryOf(
  metadata: Record<string, any>,
  projectId: string | null,
  appUrl: string,
  detail?: string | null
): DebriefEntry {
  return {
    taskId: taskKeyOf(metadata) ?? "unknown",
    title: metadata.taskTitle || "Untitled task",
    projectName: null,
    url: projectId ? `${appUrl}/projects/${projectId}` : null,
    detail: detail ?? null,
  };
}

/** "todo → doing", or just the destination when the origin is unknown. */
function movementLabel(from: string | null, to: string | null): string | null {
  if (from && to) return `${from} → ${to}`;
  if (to) return `moved to ${to}`;
  return null;
}

/**
 * Reads every activity event in the window.
 *
 * A single-field range on `timestamp` needs no composite index. The cap is a
 * guard against a pathological day, not a paging strategy — a run that hits
 * it reports the fact rather than silently truncating someone's debrief.
 */
async function fetchEvents(
  from: Date,
  to: Date
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const snap = await adminDb
    .collection("activity")
    .where("timestamp", ">=", Timestamp.fromDate(from))
    .where("timestamp", "<", Timestamp.fromDate(to))
    .limit(MAX_EVENTS)
    .get();

  return snap.docs;
}

/**
 * Compiles and sends one evening's debriefs.
 *
 * `dryRun` does every read and every grouping but sends nothing and claims
 * nothing, so a run can be inspected without spending sends or burning the
 * day's idempotency claim.
 */
export async function runDailyDebrief(options?: {
  now?: Date;
  dryRun?: boolean;
  /** Re-run a day that has already been claimed. Operator escape hatch. */
  force?: boolean;
}): Promise<DebriefRunResult> {
  const now = options?.now ?? new Date();
  const dryRun = options?.dryRun ?? false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.orbit-os.co.za";
  const skipped: string[] = [];

  const dayKey = sastDayKey(now);
  const to = sastInstant(dayKey, CUTOFF_HOUR);
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);

  const window = { from: from.toISOString(), to: to.toISOString() };

  /* ---------------------------------------------------------------- */
  /*  Claim the day before doing anything that costs money.            */
  /*                                                                   */
  /*  `create` fails if the document exists, which makes the claim     */
  /*  atomic without a transaction. A retry inside the same window     */
  /*  therefore sends nothing rather than mailing everybody twice.     */
  /*  The trade is that a run which dies midway leaves the day claimed */
  /*  — recoverable with `force`, and the safer direction to fail for  */
  /*  something whose failure mode is duplicate mail.                  */
  /* ---------------------------------------------------------------- */

  const claimRef = adminDb.collection("scheduled_runs").doc(`debrief-${dayKey}`);

  if (!dryRun && !options?.force) {
    try {
      await claimRef.create({
        job: "debrief",
        dayKey,
        claimedAt: Timestamp.fromDate(now),
      });
    } catch {
      return {
        dayKey,
        window,
        eventsScanned: 0,
        candidates: 0,
        emailsSent: 0,
        emailsFailed: 0,
        skipped: [`${dayKey} already ran — pass force=1 to send it again`],
      };
    }
  }

  const docs = await fetchEvents(from, to);

  if (docs.length >= MAX_EVENTS) {
    skipped.push(`hit the ${MAX_EVENTS}-event read cap; some activity was not read`);
  }

  /* ---------------------------------------------------------------- */
  /*  Group by person.                                                 */
  /* ---------------------------------------------------------------- */

  const buckets = new Map<string, Bucket>();

  const bucketFor = (uid: string, orgId: string): Bucket => {
    let bucket = buckets.get(uid);
    if (!bucket) {
      bucket = emptyBucket(orgId);
      buckets.set(uid, bucket);
    }
    return bucket;
  };

  for (const doc of docs) {
    const event = doc.data();
    const metadata: Record<string, any> = event.metadata ?? {};
    const actorUid: string | undefined = event.actor?.uid;
    const orgId: string = event.orgId;
    const projectId: string | null = event.projectId ?? null;
    const key = taskKeyOf(metadata);

    if (!orgId || !key) continue;

    switch (event.eventType) {
      case "DIRECTIVE_CREATED": {
        if (!actorUid) break;
        bucketFor(actorUid, orgId).created.set(
          key,
          entryOf(metadata, projectId, appUrl)
        );
        break;
      }

      case "DIRECTIVE_ASSIGNED": {
        const assignees: string[] = Array.isArray(metadata.assigneeUids)
          ? metadata.assigneeUids
          : [];

        for (const uid of assignees) {
          // Handing work to yourself is not news, and it already shows up
          // under Created when that is where it came from.
          if (uid === actorUid) continue;
          bucketFor(uid, orgId).assigned.set(
            key,
            entryOf(
              metadata,
              projectId,
              appUrl,
              event.actor?.name ? `from ${event.actor.name}` : null
            )
          );
        }
        break;
      }

      case "DIRECTIVE_TRANSITION":
      case "STATUS_TRANSITION": {
        if (!actorUid) break;

        const toStatus = typeof metadata.to === "string" ? metadata.to : null;
        const fromStatus = typeof metadata.from === "string" ? metadata.from : null;
        const bucket = bucketFor(actorUid, orgId);

        // Completion is a transition to "done" rather than an event of its
        // own — that is how the in-app feed has always recorded it — so the
        // two sections are split apart here rather than at the write.
        if (toStatus === "done") {
          bucket.completed.set(key, entryOf(metadata, projectId, appUrl));
          // A task finished today should not also be listed as merely moved.
          bucket.moved.delete(key);
          break;
        }

        // Reopened after being closed earlier the same day. It stays under
        // Completed — the close happened — and the reopen is the more
        // recent truth, so both sections would be half right. Completed
        // wins because that is the section people scan for.
        if (bucket.completed.has(key)) break;

        const existing = bucket.moved.get(key);
        const firstFrom = existing?.firstFrom ?? fromStatus;

        bucket.moved.set(key, {
          ...entryOf(metadata, projectId, appUrl),
          firstFrom,
          lastTo: toStatus,
          detail: movementLabel(firstFrom, toStatus),
        });
        break;
      }

      default:
        break;
    }
  }

  if (buckets.size === 0) {
    return {
      dayKey,
      window,
      eventsScanned: docs.length,
      candidates: 0,
      emailsSent: 0,
      emailsFailed: 0,
      skipped,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Resolve recipients.                                              */
  /* ---------------------------------------------------------------- */

  const uids = [...buckets.keys()];
  const orgIds = new Set([...buckets.values()].map((bucket) => bucket.orgId));

  const [users, orgs] = await Promise.all([
    getAllByIds("users", uids),
    getAllByIds("organizations", [...orgIds]),
  ]);

  const queue: PendingDebrief[] = [];

  /* One tier lookup per org rather than per recipient. `resolveOrgTier`
     caches for a minute anyway, but a workspace with twenty active people
     should not ask twenty times inside one run. */
  const allowances = new Map<string, number>();
  const allowanceFor = async (orgId: string): Promise<number> => {
    const hit = allowances.get(orgId);
    if (hit !== undefined) return hit;
    const allowance = await resolveDebriefAllowance(orgId);
    allowances.set(orgId, allowance);
    return allowance;
  };

  for (const [uid, bucket] of buckets) {
    const sections: DailyDebriefSections = {
      created: [...bucket.created.values()],
      assigned: [...bucket.assigned.values()],
      moved: [...bucket.moved.values()],
      completed: [...bucket.completed.values()],
    };

    // "Skip users with zero activity" — reaching here means at least one
    // event was attributed, but a person whose only events were filtered
    // out along the way still ends up empty.
    if (debriefTotal(sections) === 0) continue;

    const user = users.get(uid);

    if (!user?.email) {
      skipped.push(`${uid} (no user record or no email)`);
      continue;
    }

    if (!resolvePreferences(user.preferences).dailyDebrief) {
      skipped.push(`${user.email} (debrief disabled)`);
      continue;
    }

    /* ---------------------------------------------------------------- */
    /*  Paid feature, with a trial.                                      */
    /*                                                                   */
    /*  The free tier gets a fixed lifetime allowance rather than a      */
    /*  daily one: three debriefs arrive, the third says so, and the     */
    /*  fourth never comes until the workspace is on a paid plan. The    */
    /*  count lives on the USER because the mail is personal — one       */
    /*  teammate's three should not spend everybody else's.              */
    /* ---------------------------------------------------------------- */

    const allowance = await allowanceFor(bucket.orgId);
    let trial: DebriefTrial | undefined;

    if (allowance !== -1) {
      const alreadySent =
        typeof user.debriefsSent === "number" ? user.debriefsSent : 0;

      if (alreadySent >= allowance) {
        skipped.push(`${user.email} (free debrief allowance used)`);
        continue;
      }

      trial = {
        number: alreadySent + 1,
        allowance,
        upgradeUrl: `${appUrl}/pricing`,
      };
    }

    queue.push({
      uid,
      email: user.email,
      name: user.name || user.email,
      orgId: bucket.orgId,
      orgName: orgs.get(bucket.orgId)?.name ?? "your workspace",
      sections,
      trial,
    });
  }

  // Deterministic, so a truncated run keeps reaching the same people rather
  // than a different subset every evening.
  queue.sort((a, b) => a.email.localeCompare(b.email));

  const sending = queue.slice(0, HARD_MAX_PER_RUN);
  if (queue.length > sending.length) {
    skipped.push(
      `${queue.length - sending.length} recipient(s) over the ${HARD_MAX_PER_RUN}/run ceiling`
    );
  }

  if (dryRun) {
    return {
      dayKey,
      window,
      eventsScanned: docs.length,
      candidates: queue.length,
      emailsSent: 0,
      emailsFailed: 0,
      skipped: [...skipped, `dry run — ${sending.length} email(s) withheld`],
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Send.                                                            */
  /* ---------------------------------------------------------------- */

  let emailsSent = 0;
  let emailsFailed = 0;

  /* Only trial recipients whose mail actually went out. A send that failed
     must not burn one of somebody's three — they never received it, and a
     silently spent allowance is the one failure mode here that costs the
     recipient rather than us. */
  const spentTrial: string[] = [];

  for (let i = 0; i < sending.length; i += WAVE_SIZE) {
    const wave = sending.slice(i, i + WAVE_SIZE);

    const results = await Promise.all(
      wave.map((pending) =>
        sendDailyDebrief({
          recipient: { name: pending.name, email: pending.email },
          orgName: pending.orgName,
          dayKey,
          sections: pending.sections,
          dashboardUrl: `${appUrl}/dashboard`,
          trial: pending.trial,
        })
      )
    );

    results.forEach((result, index) => {
      const pending = wave[index];
      if (result.success) {
        emailsSent += 1;
        if (pending.trial) spentTrial.push(pending.uid);
      } else {
        emailsFailed += 1;
        skipped.push(`${pending.email} (send failed: ${result.error})`);
      }
    });
  }

  for (let i = 0; i < spentTrial.length; i += 400) {
    const batch = adminDb.batch();
    for (const uid of spentTrial.slice(i, i + 400)) {
      batch.update(adminDb.collection("users").doc(uid), {
        debriefsSent: FieldValue.increment(1),
      });
    }
    await batch.commit();
  }

  return {
    dayKey,
    window,
    eventsScanned: docs.length,
    candidates: queue.length,
    emailsSent,
    emailsFailed,
    skipped,
  };
}

async function getAllByIds(
  collection: string,
  ids: string[]
): Promise<Map<string, FirebaseFirestore.DocumentData>> {
  const found = new Map<string, FirebaseFirestore.DocumentData>();
  if (ids.length === 0) return found;

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
