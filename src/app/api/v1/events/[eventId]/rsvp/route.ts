import { NextResponse } from "next/server";

import { apiError, apiRoute } from "@/lib/api/request";
import { setRsvp } from "@/lib/events/core";
import type { RsvpStatus } from "@/types/event";

/* ------------------------------------------------------------------ */
/*  POST /api/v1/events/:id/rsvp — answer an invitation                */
/*                                                                     */
/*  Only ever the token owner's own answer. "pending" is left out: an  */
/*  assistant has no reason to un-answer an invitation. Counted as     */
/*  mail, because the organizer is emailed the answer.                 */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANSWERS: RsvpStatus[] = ["accepted", "declined", "tentative"];

export const POST = apiRoute<{ eventId: string }>(
  { scope: "write", kind: "mail" },
  async ({ caller, params, body }) => {
    const status = body?.status;
    if (typeof status !== "string" || !ANSWERS.includes(status as RsvpStatus)) {
      return apiError(400, '"status" must be accepted, declined, or tentative.');
    }

    const result = await setRsvp(caller, params.eventId, status as RsvpStatus);
    if (!result.success) return apiError(400, result.error);
    return NextResponse.json({ rsvp: status });
  }
);
