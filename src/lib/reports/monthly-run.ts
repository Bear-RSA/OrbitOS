import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

import { resolveMonthlyReportLimit } from "@/lib/auth/permissions";
import { sendHealthReport } from "@/lib/email/sendHealthReport";
import { resolvePrimaryOwnerId } from "@/lib/members/hierarchy";
import { dueDateKeyOf } from "@/lib/utils/dates";
import { resolvePreferences } from "@/types/preferences";
import {
  buildHealthReport,
  isQuietMonth,
  previousMonthKey,
  type HealthReport,
  type ReportTask,
} from "./health-report";

/* ------------------------------------------------------------------ */
/*  Monthly health report run                                          */
/*                                                                     */
/*  Runs on the 1st (vercel.json) and mails each workspace's owners    */
/*  how the month that just ended went.                                */
/*                                                                     */
/*  Every report is also kept at `health_reports/{orgId}-{YYYY-MM}`.   */
/*  That record is the idempotency claim, so a second run in the same  */
/*  month sends nothing, and it is the history a later trend view      */
/*  reads from: the numbers a month had are stored once, not worked    */
/*  out again from tasks that have since changed.                      */
/*                                                                     */
/*  A claim whose sends all failed is marked `failed` and a re-run may */
/*  take it again. One that reached anybody is `sent` and stays sent.  */
/* ------------------------------------------------------------------ */

/**
 * Hard ceilings. ALWAYS on, independent of BILLING_GUARDRAILS_ENABLED,
 * because every copy is a Resend send. A tier may narrow an org below
 * these (`resolveMonthlyReportLimit`); nothing widens them.
 */
export const HARD_MAX_RECIPIENTS_PER_ORG = 5;
export const HARD_MAX_PER_RUN = 500;

/** Sent in bounded waves so the 1st does not trip Resend's rate limit. */
const WAVE_SIZE = 8;

const COLLECTION = "health_reports";

export interface MonthlyRunResult {
  monthKey: string;
  /** Workspaces looked at. */
  orgs: number;
  /** Workspaces a report was built and claimed for. */
  reported: number;
  emailsSent: number;
  emailsFailed: number;
  /** Workspaces or people left out, with the reason. */
  skipped: string[];
}

interface Recipient {
  uid: string;
  name: string;
  email: string;
}

function millisOf(value: unknown): number | null {
  if (value && typeof (value as Timestamp).toMillis === "function") {
    return (value as Timestamp).toMillis();
  }
  return null;
}

function toReportTask(task: FirebaseFirestore.DocumentData): ReportTask {
  return {
    projectId: typeof task.projectId === "string" ? task.projectId : "",
    status: task.status === "done" || task.status === "doing" ? task.status : "todo",
    assignedTo: Array.isArray(task.assignedTo)
      ? task.assignedTo.filter((uid: unknown): uid is string => typeof uid === "string")
      : [],
    createdAtMs: millisOf(task.createdAt),
    completedAtMs: millisOf(task.completedAt),
    dueDateKey: dueDateKeyOf(task),
    isBlocked: Boolean(task.isBlocked),
  };
}

/**
 * The owners this workspace's report goes to, main owner first so a plan
 * that allows one copy sends it to the same person every month.
 */
function pickRecipients(
  users: FirebaseFirestore.QueryDocumentSnapshot[],
  storedOwnerId: string | undefined,
  limit: number,
  skipped: string[]
): Recipient[] {
  const owners = users.filter((doc) => doc.data().role === "OWNER");
  const primaryId = resolvePrimaryOwnerId(
    storedOwnerId,
    owners.map((doc) => ({
      id: doc.id,
      createdAtMillis: doc.data().createdAt?.toMillis?.() ?? 0,
    }))
  );

  const ordered = [...owners].sort((a, b) => {
    if (a.id === primaryId) return -1;
    if (b.id === primaryId) return 1;
    const byCreated =
      (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0);
    return byCreated || a.id.localeCompare(b.id);
  });

  const recipients: Recipient[] = [];
  for (const doc of ordered) {
    const user = doc.data();
    if (!user.email) {
      skipped.push(`${doc.id} (owner with no email)`);
      continue;
    }
    if (!resolvePreferences(user.preferences).monthlyReport) {
      skipped.push(`${user.email} (monthly report turned off)`);
      continue;
    }
    recipients.push({ uid: doc.id, name: user.name || user.email, email: user.email });
  }

  if (recipients.length > limit) {
    skipped.push(
      `${recipients.length - limit} owner(s) over the plan's ${limit}-copy report limit`
    );
  }
  return recipients.slice(0, limit);
}

/**
 * Takes this month's claim for one workspace. False when another run
 * already has it: sending, or sent.
 */
async function claim(id: string, data: Record<string, unknown>): Promise<boolean> {
  const ref = adminDb.collection(COLLECTION).doc(id);
  try {
    await ref.create(data);
    return true;
  } catch {
    const existing = (await ref.get()).data();
    if (existing?.status !== "failed") return false;
    await ref.set(data);
    return true;
  }
}

/**
 * Sends the reports for one month.
 *
 * `dryRun` builds every report and picks every recipient but sends,
 * claims and stores nothing.
 */
export async function runMonthlyHealthReports(options?: {
  now?: Date;
  dryRun?: boolean;
}): Promise<MonthlyRunResult> {
  const now = options?.now ?? new Date();
  const dryRun = options?.dryRun ?? false;
  const monthKey = previousMonthKey(now);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.orbit-os.co.za";
  const skipped: string[] = [];

  const orgsSnap = await adminDb.collection("organizations").get();

  let reported = 0;
  let emailsSent = 0;
  let emailsFailed = 0;
  let queued = 0;

  for (const orgDoc of orgsSnap.docs) {
    const orgId = orgDoc.id;
    const org = orgDoc.data();
    const orgName: string = org.name ?? "your workspace";

    // Checked first: a free workspace costs one cached read and nothing else.
    const tierLimit = await resolveMonthlyReportLimit(orgId);
    const limit =
      tierLimit === -1
        ? HARD_MAX_RECIPIENTS_PER_ORG
        : Math.min(tierLimit, HARD_MAX_RECIPIENTS_PER_ORG);
    if (limit <= 0) {
      skipped.push(`${orgId} (plan does not include the report)`);
      continue;
    }

    if (queued >= HARD_MAX_PER_RUN) {
      skipped.push(`${orgId} (over the ${HARD_MAX_PER_RUN}/run global ceiling)`);
      continue;
    }

    const [tasksSnap, projectsSnap, usersSnap] = await Promise.all([
      adminDb.collection("tasks").where("orgId", "==", orgId).get(),
      adminDb.collection("projects").where("orgId", "==", orgId).get(),
      adminDb.collection("users").where("orgId", "==", orgId).get(),
    ]);

    const report: HealthReport = buildHealthReport({
      monthKey,
      tasks: tasksSnap.docs.map((doc) => toReportTask(doc.data())),
      projects: projectsSnap.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name ?? "Untitled project",
        archived: doc.data().archived === true,
      })),
      people: usersSnap.docs.map((doc) => ({
        uid: doc.id,
        name: doc.data().name || doc.data().email || "A teammate",
      })),
    });

    // An empty month is not news, and a mail saying "0 tasks" every month
    // teaches people to ignore the one that matters.
    if (isQuietMonth(report)) {
      skipped.push(`${orgId} (quiet month)`);
      continue;
    }

    const recipients = pickRecipients(usersSnap.docs, org.ownerId, limit, skipped).slice(
      0,
      HARD_MAX_PER_RUN - queued
    );
    if (recipients.length === 0) {
      skipped.push(`${orgId} (no owner to send to)`);
      continue;
    }

    if (dryRun) {
      reported += 1;
      queued += recipients.length;
      continue;
    }

    const id = `${orgId}-${monthKey}`;
    const claimed = await claim(id, {
      orgId,
      monthKey,
      report,
      status: "sending",
      createdAt: Timestamp.fromDate(now),
    });
    if (!claimed) {
      skipped.push(`${orgId} (already reported for ${monthKey})`);
      continue;
    }

    reported += 1;
    queued += recipients.length;

    let orgSent = 0;
    for (let i = 0; i < recipients.length; i += WAVE_SIZE) {
      const wave = recipients.slice(i, i + WAVE_SIZE);
      const results = await Promise.all(
        wave.map((recipient) =>
          sendHealthReport({
            recipient,
            orgName,
            report,
            dashboardUrl: `${appUrl}/dashboard`,
            settingsUrl: `${appUrl}/settings`,
          })
        )
      );
      results.forEach((result, index) => {
        if (result.success) {
          orgSent += 1;
        } else {
          emailsFailed += 1;
          skipped.push(`${wave[index].email} (send failed: ${result.error})`);
        }
      });
    }
    emailsSent += orgSent;

    await adminDb
      .collection(COLLECTION)
      .doc(id)
      .set(
        {
          status: orgSent > 0 ? "sent" : "failed",
          sentTo: recipients.map((r) => r.uid),
          finishedAt: Timestamp.fromDate(new Date()),
        },
        { merge: true }
      );
  }

  if (dryRun) {
    skipped.push(`dry run — ${queued} email(s) withheld`);
  }

  return {
    monthKey,
    orgs: orgsSnap.docs.length,
    reported,
    emailsSent,
    emailsFailed,
    skipped,
  };
}
