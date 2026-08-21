import { NextRequest, NextResponse } from "next/server";

import { runDueTodayDigest } from "@/lib/tasks/due-today";
import { runDueTaskReminders } from "@/lib/tasks/due-reminders";
import { runOwnerDigest } from "@/lib/tasks/owner-digest";

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

/** Runs one job, converting a throw into a reported failure. */
async function guard<T>(
  name: string,
  run: () => Promise<T>
): Promise<{ job: string; ok: boolean; result?: T; error?: string }> {
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

  console.log(
    `[Cron:morning] ${jobs.length - failed.length}/${jobs.length} job(s) ok` +
      (failed.length ? ` — failed: ${failed.map((j) => j.job).join(", ")}` : "")
  );

  // 207 when some jobs ran and some did not: a blanket 500 would tell the
  // Vercel log that nothing happened, and a blanket 200 would hide that
  // somebody's mail never went out.
  return NextResponse.json(
    { success: failed.length === 0, jobs },
    { status: failed.length === 0 ? 200 : 207 }
  );
}

// Vercel cron issues a GET.
export async function GET(req: NextRequest) {
  return POST(req);
}
