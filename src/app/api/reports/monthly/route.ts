import { NextRequest, NextResponse } from "next/server";

import { runMonthlyHealthReports } from "@/lib/reports/monthly-run";
import { recordRunCrash, recordRunOutcome } from "@/lib/tasks/run-log";

/* ------------------------------------------------------------------ */
/*  Monthly health report                                              */
/*                                                                     */
/*  Scheduled in vercel.json at 07:00 UTC on the 1st — 09:00 SAST —    */
/*  and reports on the month that just ended.                          */
/*                                                                     */
/*  Same guard as the reminder cron: Vercel sends                      */
/*  `Authorization: Bearer $CRON_SECRET`, so a manual trigger needs    */
/*  it too. Append ?dryRun=1 to see what a run would send, and         */
/*  ?asOf=YYYY-MM-DD with it to report on the month before that day.   */
/* ------------------------------------------------------------------ */

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  try {
    // Honoured for dry runs only, like the reminder cron: a real run for a
    // chosen month would claim it, and the real 1st would then send nothing.
    const asOf = dryRun ? req.nextUrl.searchParams.get("asOf") : null;
    const now =
      asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? new Date(`${asOf}T12:00:00Z`) : undefined;

    if (asOf && !now) {
      return NextResponse.json({ error: "asOf must be YYYY-MM-DD" }, { status: 400 });
    }

    const result = await runMonthlyHealthReports({ dryRun, now });

    console.log(
      `[MonthlyHealth] ${result.monthKey}: ${result.reported}/${result.orgs} workspace(s), ` +
        `${result.emailsSent} sent, ${result.emailsFailed} failed`
    );

    if (!dryRun) {
      await recordRunOutcome({
        job: "monthly-health",
        emailsSent: result.emailsSent,
        emailsFailed: result.emailsFailed,
        errors: result.skipped.filter((line) => line.includes("send failed")),
      });
    }

    const outage = result.emailsFailed > 0 && result.emailsSent === 0;
    const clean = result.emailsFailed === 0;

    return NextResponse.json(
      { success: clean, ...result },
      { status: clean ? 200 : outage ? 500 : 207 }
    );
  } catch (err) {
    console.error("[MonthlyHealth] Run failed:", err);
    if (!dryRun) {
      await recordRunCrash("monthly-health", err instanceof Error ? err.message : "Internal error");
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Vercel cron issues a GET.
export async function GET(req: NextRequest) {
  return POST(req);
}
