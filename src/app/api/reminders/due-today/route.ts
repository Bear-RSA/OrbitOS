import { NextRequest, NextResponse } from "next/server";

import { runDueTodayDigest } from "@/lib/tasks/due-today";

/* ------------------------------------------------------------------ */
/*  Due-today digest                                                   */
/*                                                                     */
/*  No longer scheduled directly: Vercel's Hobby plan allows two cron  */
/*  jobs and this workspace runs four scheduled mails, so the morning  */
/*  three are dispatched together by /api/cron/morning at 04:00 UTC —  */
/*  06:00 SAST. This route stays because it is the way to trigger the  */
/*  digest on its own, for a manual run or a retry.                    */
/*                                                                     */
/*  Vercel's scheduler sends `Authorization: Bearer $CRON_SECRET`, so  */
/*  the same header check as the other jobs guards a manual trigger.   */
/*  Append ?dryRun=1 to see what a run would send without sending it,  */
/*  and ?asOf=YYYY-MM-DD with it to ask the same question of another   */
/*  day — the only way to test against a day that has work on it.      */
/* ------------------------------------------------------------------ */

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  // An unset secret would make the expected header the literal string
  // "Bearer undefined" — checked separately so a missing env var closes
  // the endpoint instead of opening it.
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

    /* `asOf=YYYY-MM-DD` pretends the run happened on that day, so a dry run
       can be pointed at a day that actually has work on it — otherwise the
       only testable day is today, and "0 candidates" proves nothing.
       Honoured for dry runs ONLY: a real run with a chosen date would mail
       people about a day that is not today. Midday, so the SAST reading of
       the day cannot slip onto a neighbouring one. */
    const asOf = dryRun ? req.nextUrl.searchParams.get("asOf") : null;

    if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      return NextResponse.json({ error: "asOf must be YYYY-MM-DD" }, { status: 400 });
    }

    const now = asOf ? new Date(`${asOf}T12:00:00Z`) : undefined;

    const result = await runDueTodayDigest({ dryRun, now });

    console.log(
      `[DueToday] ${result.targetDateKey}: ${result.candidates} task(s) due, ` +
        `${result.emailsSent} sent, ${result.emailsFailed} failed, ${result.skipped.length} skipped`
    );

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[DueToday] Run failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Vercel cron issues a GET.
export async function GET(req: NextRequest) {
  return POST(req);
}
