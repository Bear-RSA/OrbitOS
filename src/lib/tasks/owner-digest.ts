import { adminDb } from "@/lib/firebase/admin";

import { sendDailyDigest } from "@/lib/email/daily-digest";
import { resolvePreferences } from "@/types/preferences";

/* ------------------------------------------------------------------ */
/*  Owner morning digest                                               */
/*                                                                     */
/*  Workspace health for the person accountable for it: what is        */
/*  overdue, what has stalled, and whether a project has tipped into   */
/*  risk. Owner-only by design — `/api/digest` has always looked up    */
/*  the OWNER of each organization and nobody else.                    */
/*                                                                     */
/*  Lifted out of the route body unchanged so the morning cron         */
/*  dispatcher can call it directly. Vercel's Hobby plan allows two    */
/*  cron jobs, and this workspace runs four scheduled mails, so the    */
/*  three morning jobs share one invocation rather than one slot each. */
/*  Calling in-process instead of re-entering over HTTP keeps that     */
/*  invocation inside a single function budget.                        */
/* ------------------------------------------------------------------ */

export interface OwnerDigestResult {
  /** One line per organization considered, sent or skipped. */
  results: string[];
  emailsSent: number;
  /** Accepted by us and refused by Resend. Counted, never assumed to be zero. */
  emailsFailed: number;
}

export async function runOwnerDigest(options?: {
  now?: Date;
  dryRun?: boolean;
}): Promise<OwnerDigestResult> {
  const now = options?.now ?? new Date();
  const dryRun = options?.dryRun ?? false;

  const orgsSnap = await adminDb.collection("organizations").get();
  const results: string[] = [];
  let emailsSent = 0;
  let emailsFailed = 0;

  for (const orgDoc of orgsSnap.docs) {
    const org = orgDoc.data();
    const orgId = orgDoc.id;

    // Get owner
    const usersSnap = await adminDb
      .collection("users")
      .where("orgId", "==", orgId)
      .where("role", "==", "OWNER")
      .limit(1)
      .get();

    if (usersSnap.empty) continue;
    const owner = usersSnap.docs[0].data();

    // Settings -> Notifications. An owner who has switched the digest off
    // is skipped before any of the aggregation work below runs.
    const ownerPrefs = resolvePreferences(owner.preferences);
    if (!ownerPrefs.dailyDigest) {
      results.push(`Skipped ${owner.email} (digest disabled)`);
      continue;
    }

    // Get tasks
    const tasksSnap = await adminDb
      .collection("tasks")
      .where("orgId", "==", orgId)
      .get();

    const tasks = tasksSnap.docs.map((d) => d.data());
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const fortyEightHoursAgo = new Date(now);
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

    const overdueCount = tasks.filter(
      (t) => t.status !== "done" && t.dueDate && t.dueDate.toDate() < now
    ).length;

    const inactiveCount = tasks.filter(
      (t) =>
        t.status === "doing" &&
        t.lastUpdatedAt &&
        t.lastUpdatedAt.toDate() < fortyEightHoursAgo
    ).length;

    const yesterdayCompleted = tasks.filter((t) => {
      if (t.status !== "done" || !t.completedAt) return false;
      const completed = t.completedAt.toDate();
      return completed >= yesterday && completed < now;
    }).length;

    // Project risk
    const project = await adminDb
      .collection("projects")
      .where("orgId", "==", orgId)
      .limit(1)
      .get();

    const projectName = project.empty ? null : project.docs[0].data().name;
    const totalTasks = tasks.filter((t) => t.status !== "done").length;
    const overduePercent = totalTasks > 0 ? overdueCount / totalTasks : 0;
    let atRiskStatus: "watch" | "at-risk" | null = null;
    if (overduePercent > 0.25) atRiskStatus = "at-risk";
    else if (overduePercent > 0) atRiskStatus = "watch";

    // "Only when something needs attention" — a quiet day sends nothing
    // rather than an all-clear mail.
    if (ownerPrefs.digestOnlyWhenAttention && overdueCount + inactiveCount === 0) {
      results.push(`Skipped ${owner.email} (nothing needs attention)`);
      continue;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.orbit-os.co.za";

    if (dryRun) {
      results.push(`Would send digest to ${owner.email}`);
      continue;
    }

    const sendResult = await sendDailyDigest({
      ownerName: owner.name,
      ownerEmail: owner.email,
      orgName: org.name,
      overdueCount,
      inactiveCount,
      atRiskProjectName: atRiskStatus ? projectName : null,
      atRiskStatus,
      overduePercent,
      yesterdayCompleted,
      dashboardUrl: `${appUrl}/dashboard`,
    });

    if (!sendResult.success) {
      emailsFailed += 1;
      results.push(`FAILED ${owner.email} (${sendResult.error})`);
      continue;
    }

    emailsSent += 1;
    results.push(`Sent digest to ${owner.email}`);
  }

  return { results, emailsSent, emailsFailed };
}
