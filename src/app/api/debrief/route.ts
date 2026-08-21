import { NextRequest, NextResponse } from "next/server";

import { runDailyDebrief } from "@/lib/tasks/debrief";

/* ------------------------------------------------------------------ */
/*  End-of-day debrief cron                                            */
/*                                                                     */
/*  Scheduled in vercel.json at 16:00 UTC — 18:00 SAST. Vercel Cron    */
/*  schedules are UTC and take no timezone, so the +2 offset is        */
/*  applied in the cron expression; SAST observes no DST, which is     */
/*  what makes that arithmetic safe year round.                        */
/*                                                                     */
/*  Distinct from /api/digest, which is the OWNER's morning read on    */
/*  workspace health (overdue counts, stalled work, project risk).     */
/*  This one is per-person and backward-looking: what you did today.   */
/*                                                                     */
/*  ?dryRun=1 inspects a run without sending or claiming the day.      */
/*  ?force=1 re-runs a day whose claim already exists — the escape     */
/*  hatch for a run that died partway through.                         */
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
    const force = req.nextUrl.searchParams.get("force") === "1";

    const result = await runDailyDebrief({ dryRun, force });

    console.log(
      `[Debrief] ${result.dayKey}: ${result.eventsScanned} event(s) scanned, ` +
        `${result.candidates} recipient(s), ${result.emailsSent} sent, ` +
        `${result.emailsFailed} failed, ${result.skipped.length} skipped`
    );

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[Debrief] Run failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Vercel cron issues a GET.
export async function GET(req: NextRequest) {
  return POST(req);
}
