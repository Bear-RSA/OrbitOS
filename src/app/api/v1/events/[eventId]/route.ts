import { NextRequest, NextResponse } from "next/server";

import { apiError, authenticateApi, readJson } from "@/lib/api/request";
import { updateEvent } from "@/lib/events/core";
import { getEvent } from "@/lib/events/views";
import type { UpdateEventInput } from "@/types/event";

/* ------------------------------------------------------------------ */
/*  GET   /api/v1/events/:id — one meeting with everyone's answer      */
/*  PATCH /api/v1/events/:id — reschedule or edit                      */
/*                                                                     */
/*  Only the organizer, or an owner, may edit — the same rule as the   */
/*  app. A change to the time or place re-mails everyone on it.        */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ eventId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await authenticateApi(req.headers, "read");
  if (!auth.ok) return auth.response;

  const { eventId } = await params;
  const result = await getEvent(auth.caller, eventId);
  if (!result.success) return apiError(404, result.error);
  return NextResponse.json({ event: result.event });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await authenticateApi(req.headers, "write");
  if (!auth.ok) return auth.response;

  const { eventId } = await params;
  const body = await readJson(req);
  if (!body) return apiError(400, "Send a JSON object.");

  const result = await updateEvent(auth.caller, eventId, body as UpdateEventInput);
  if (!result.success) return apiError(400, result.error);

  const updated = await getEvent(auth.caller, eventId);
  if (!updated.success) return apiError(404, updated.error);
  return NextResponse.json({ event: updated.event, invites: result.invites });
}
