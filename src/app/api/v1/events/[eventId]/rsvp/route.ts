import { NextRequest, NextResponse } from "next/server";

import { apiError, authenticateApi, readJson } from "@/lib/api/request";
import { setRsvp } from "@/lib/events/core";
import type { RsvpStatus } from "@/types/event";

/* ------------------------------------------------------------------ */
/*  POST /api/v1/events/:id/rsvp — answer an invitation                */
/*                                                                     */
/*  Only ever the token owner's own answer. "pending" is left out: an  */
/*  assistant has no reason to un-answer an invitation.                */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANSWERS: RsvpStatus[] = ["accepted", "declined", "tentative"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticateApi(req.headers, "write");
  if (!auth.ok) return auth.response;

  const { eventId } = await params;
  const body = await readJson(req);
  const status = body?.status;
  if (typeof status !== "string" || !ANSWERS.includes(status as RsvpStatus)) {
    return apiError(400, '"status" must be accepted, declined, or tentative.');
  }

  const result = await setRsvp(auth.caller, eventId, status as RsvpStatus);
  if (!result.success) return apiError(400, result.error);
  return NextResponse.json({ rsvp: status });
}
