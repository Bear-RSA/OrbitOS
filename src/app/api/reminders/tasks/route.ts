import { NextRequest, NextResponse } from "next/server";

import { runDueTaskReminders } from "@/lib/tasks/due-reminders";

/* ------------------------------------------------------------------ */
/*  Task due-soon reminder cron                                        */
/*                                                                     */
/*  Scheduled in vercel.json at 12:00 UTC. Due dates are stored as     */
/*  midday UTC of their calendar day, so a run at that hour reaches    */
/*  tomorrow's assignees exactly 24 hours before the work is due.      */
/*                                                                     */
/*  Vercel's scheduler sends `Authorization: Bearer $CRON_SECRET`, so  */
/*  the same header check as /api/digest guards a manual trigger.      */
/*  Append ?dryRun=1 to see what a run would send without sending it,  */
/*  and ?asOf=YYYY-MM-DD with it to ask the same question of another   */
/*  day — the only way to test against a day that has work on it.      */
/* ------------------------------------------------------------------ */

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

    /* `asOf=YYYY-MM-DD` pretends the run happened on that day, so a dry run
       can be pointed at a day that actually has work on it — otherwise the
       only testable day is tomorrow, and "0 candidates" proves nothing.
       Honoured for dry runs ONLY: a real run with a chosen date would mail
       people about a day that is not 24 hours away. */
    const asOf = dryRun ? req.nextUrl.searchParams.get("asOf") : null;
    const now =
      asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf)
        ? new Date(`${asOf}T00:00:00Z`)
        : undefined;

    if (asOf && !now) {
      return NextResponse.json(
        { error: "asOf must be YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const result = await runDueTaskReminders({ dryRun, now });

    console.log(
      `[TaskReminders] ${result.targetDateKey}: ${result.candidates} task(s) due, ` +
        `${result.emailsSent} sent, ${result.emailsFailed} failed, ${result.skipped.length} skipped`
    );

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[TaskReminders] Run failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Vercel cron issues a GET.
export async function GET(req: NextRequest) {
  return POST(req);
}
