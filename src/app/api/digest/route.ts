import { NextRequest, NextResponse } from "next/server";

import { runOwnerDigest } from "@/lib/tasks/owner-digest";

/* ------------------------------------------------------------------ */
/*  Owner morning digest                                               */
/*                                                                     */
/*  No longer scheduled directly: Vercel's Hobby plan allows two cron  */
/*  jobs and this workspace runs four scheduled mails, so the three    */
/*  morning jobs are dispatched together by /api/cron/morning. This    */
/*  route stays because it is the way to trigger the digest on its own */
/*  — a manual run, or a retry after one org failed.                   */
/*                                                                     */
/*  Append ?dryRun=1 to see which owners a run would reach without     */
/*  sending anything.                                                  */
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
    const { results } = await runOwnerDigest({ dryRun });

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("Digest error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Vercel cron: GET handler
export async function GET(req: NextRequest) {
  return POST(req);
}
