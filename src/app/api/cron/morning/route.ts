import { NextRequest, NextResponse } from "next/server";

import { runDueTodayDigest } from "@/lib/tasks/due-today";
import { runDueTaskReminders } from "@/lib/tasks/due-reminders";
import { runOwnerDigest } from "@/lib/tasks/owner-digest";
import {
  recordRunCrash,
  recordRunOutcome,
  type ScheduledJob,
} from "@/lib/tasks/run-log";

/* ------------------------------------------------------------------ */
/*  Morning cron dispatcher                                            */
/*                                                                     */
/*  Vercel's Hobby plan allows TWO cron jobs per account, and this     */
/*  workspace runs four scheduled mails. So the schedule is split by   */
/*  time of day rather than by job: everything that belongs to the     */
/*  start of the working day runs here, and the end-of-day debrief     */
/*  gets the other slot.                                              */
/*                                                                     */
/*  The cost is that the three morning mails now share one wall-clock  */
/*  time — 06:00 SAST — instead of landing at 06:00, 07:00 and 09:00.  */
/*  All three are "here is your day" mails, so arriving together at    */
/*  the start of it is defensible; it is a plan constraint, not a      */
/*  design choice, and moving to Pro would let them separate again by  */
/*  restoring the four entries this replaced.                          */
/*                                                                     */
/*  Each job is isolated. A throw in one must not cost the other two   */
/*  their run — they are independent mails to different people, and a  */
/*  shared invocation is an implementation detail nobody receiving one */
/*  should be able to notice.                                          */
/*                                                                     */
/*  Jobs stay individually triggerable at their own routes for manual  */
/*  runs and retries: /api/reminders/due-today, /api/digest and        */
/*  /api/reminders/tasks.                                              */
/* ------------------------------------------------------------------ */

export const maxDuration = 60;

/**
 * The overlap between what the three runners return.
 *
 * They report the same two counts but name their line list differently —
 * `skipped` for the due mails, `results` for the owner digest — so the
 * dispatcher reads both and requires neither.
 */
interface RunReport {
  emailsSent?: number;
  emailsFailed?: number;
  skipped?: string[];
  results?: string[];
}

/** Runs one job, converting a throw into a reported failure. */
async function guard<T>(
  name: ScheduledJob,
  run: () => Promise<T>
): Promise<{ job: ScheduledJob; ok: boolean; result?: T; error?: string }> {
  try {
    const result = await run();
    return { job: name, ok: true, result };
  } catch (err: any) {
    console.error(`[Cron:morning] ${name} failed:`, err);
    return { job: name, ok: false, error: err?.message ?? "Internal error" };
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  // An unset secret would make the expected header the literal string
  // "Bearer undefined" — checked separately so a missing env var closes
  // the endpoint instead of opening it.
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  /* Sequential rather than parallel. All three talk to Resend, and the
     per-job wave pacing that keeps each one under the rate limit only
     works if they are not competing with each other for it. */
  const jobs = [
    await guard("due-today", () => runDueTodayDigest({ dryRun })),
    await guard("owner-digest", () => runOwnerDigest({ dryRun })),
    await guard("due-tomorrow", () => runDueTaskReminders({ dryRun })),
  ];

  const failed = jobs.filter((job) => !job.ok);

  /* Every runner reports the same two counts and a list of lines, so the
     outcome can be read off any of them without knowing which job it was.
     The failure lines differ in wording between the due mails and the
     owner digest, hence matching on both markers. */
  const outcomeOf = (result: RunReport | undefined) => {
    const lines = [...(result?.skipped ?? []), ...(result?.results ?? [])];
    return {
      emailsSent: result?.emailsSent ?? 0,
      emailsFailed: result?.emailsFailed ?? 0,
      errors: lines.filter(
        (line) => line.includes("send failed") || line.startsWith("FAILED")
      ),
    };
  };

  // A dry run inspects; it does not get to claim it delivered anything.
  if (!dryRun) {
    await Promise.all(
      jobs.map((job) =>
        job.ok
          ? recordRunOutcome({ job: job.job, ...outcomeOf(job.result) })
          : recordRunCrash(job.job, job.error ?? "Internal error")
      )
    );
  }

  const refused = jobs.reduce(
    (total, job) => total + (job.ok ? outcomeOf(job.result).emailsFailed : 0),
    0
  );
  const delivered = jobs.reduce(
    (total, job) => total + (job.ok ? outcomeOf(job.result).emailsSent : 0),
    0
  );

  console.log(
    `[Cron:morning] ${jobs.length - failed.length}/${jobs.length} job(s) ok, ` +
      `${delivered} sent, ${refused} refused` +
      (failed.length ? ` — failed: ${failed.map((j) => j.job).join(", ")}` : "")
  );

  /* Status codes are the second alarm, after the run log — a non-2xx is
     what makes Vercel's cron view show the run as errored instead of green.
     500 is reserved for the outage shape: mail to send, none of it accepted,
     which is what a dead Resend key looks like. 207 covers a partial run,
     where a blanket 500 would claim nothing happened and a blanket 200 would
     hide that somebody's mail never went out. */
  const outage = refused > 0 && delivered === 0;
  const clean = failed.length === 0 && refused === 0;

  return NextResponse.json(
    { success: clean, delivered, refused, jobs },
    { status: clean ? 200 : outage ? 500 : 207 }
  );
}

// Vercel cron issues a GET.
export async function GET(req: NextRequest) {
  return POST(req);
}
