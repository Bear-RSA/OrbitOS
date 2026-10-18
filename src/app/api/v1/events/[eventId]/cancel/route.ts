import { NextRequest, NextResponse } from "next/server";

import { apiError, authenticateApi } from "@/lib/api/request";
import { cancelEvent } from "@/lib/events/core";

/* ------------------------------------------------------------------ */
/*  POST /api/v1/events/:id/cancel — cancel a meeting                  */
/*                                                                     */
/*  A tombstone, not a delete, and everyone on it is mailed a cancel.  */
/*  Organizer or owner only, as in the app. Cancelling twice is a      */
/*  no-op rather than an error.                                        */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticateApi(req.headers, "write");
  if (!auth.ok) return auth.response;

  const { eventId } = await params;
  const result = await cancelEvent(auth.caller, eventId);
  if (!result.success) return apiError(400, result.error);
  return NextResponse.json({ cancelled: true });
}
