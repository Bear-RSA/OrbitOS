import { NextResponse } from "next/server";

import { apiError, apiRoute } from "@/lib/api/request";
import { updateEvent } from "@/lib/events/core";
import { getEvent } from "@/lib/events/views";
import type { UpdateEventInput } from "@/types/event";
import { refuseGuestsWithoutScope } from "../guests";

/* ------------------------------------------------------------------ */
/*  GET   /api/v1/events/:id — one meeting with everyone's answer      */
/*  PATCH /api/v1/events/:id — reschedule or edit                      */
/*                                                                     */
/*  Only the organizer, or an owner, may edit — the same rule as the   */
/*  app. A change to the time or place re-mails everyone on it.        */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { eventId: string };

export const GET = apiRoute<Params>({ scope: "read", kind: "read" }, async ({ caller, params }) => {
  const result = await getEvent(caller, params.eventId);
  if (!result.success) return apiError(404, result.error);
  return NextResponse.json({ event: result.event });
});

export const PATCH = apiRoute<Params>(
  { scope: "write", kind: "mail" },
  async ({ caller, params, body }) => {
    if (!body) return apiError(400, "Send a JSON object.");

    const refused = refuseGuestsWithoutScope(caller, body);
    if (refused) return refused;

    const result = await updateEvent(caller, params.eventId, body as UpdateEventInput);
    if (!result.success) return apiError(400, result.error);

    const updated = await getEvent(caller, params.eventId);
    if (!updated.success) return apiError(404, updated.error);
    return NextResponse.json({ event: updated.event, invites: result.invites });
  }
);
