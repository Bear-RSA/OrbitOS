import { NextRequest, NextResponse } from "next/server";

import { runDueTaskReminders } from "@/lib/tasks/due-reminders";
import { recordRunCrash, recordRunOutcome } from "@/lib/tasks/run-log";

/* ------------------------------------------------------------------ */
/*  Task due-soon reminder                                             */
/*                                                                     */
/*  Scheduled directly in vercel.json at 04:00 UTC — 06:00 SAST.       */
/*                                                                     */
/*  This used to run at 12:00 UTC, chosen so that a due date stored at */
/*  midday UTC was exactly 24 hours away. That precision was never     */
/*  real — a due date is a calendar DAY, so there is no hour to be     */
/*  exact about. Morning delivery is the point; the selection is       */
/*  unchanged and still means "due tomorrow".                          */
/*                                                                     */
/*  Vercel's scheduler sends `Authorization: Bearer $CRON_SECRET`, so  */
/*  the same header check guards a manual trigger.                     */
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

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  try {
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

    // A dry run inspects; it does not get to claim it delivered anything.
    if (!dryRun) {
      await recordRunOutcome({
        job: "due-tomorrow",
        dayKey: result.targetDateKey,
        emailsSent: result.emailsSent,
        emailsFailed: result.emailsFailed,
        errors: result.skipped.filter((line) => line.includes("send failed")),
      });
    }

    /* Status codes are the second alarm, after the run log — a non-2xx is
       what makes Vercel's cron view show the run as errored instead of green.
       500 is reserved for the outage shape: mail to send, none of it accepted,
       which is what a dead Resend key looks like. 207 covers a partial run,
       where a blanket 500 would claim nothing happened and a blanket 200 would
       hide that somebody's mail never went out. */
    const outage = result.emailsFailed > 0 && result.emailsSent === 0;
    const clean = result.emailsFailed === 0;

    return NextResponse.json(
      { success: clean, ...result },
      { status: clean ? 200 : outage ? 500 : 207 }
    );
  } catch (err) {
    console.error("[TaskReminders] Run failed:", err);
    if (!dryRun) {
      await recordRunCrash(
        "due-tomorrow",
        err instanceof Error ? err.message : "Internal error"
      );
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Vercel cron issues a GET.
export async function GET(req: NextRequest) {
  return POST(req);
}
