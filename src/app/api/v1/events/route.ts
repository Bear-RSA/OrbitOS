import { NextRequest, NextResponse } from "next/server";

import { apiError, authenticateApi, readJson } from "@/lib/api/request";
import { createEvent } from "@/lib/events/core";
import { listEvents } from "@/lib/events/views";
import type { CreateEventInput } from "@/types/event";

/* ------------------------------------------------------------------ */
/*  GET  /api/v1/events — meetings in a window, the caller's by default */
/*  POST /api/v1/events — book a meeting                               */
/*                                                                     */
/*  Booking sends real invitations: members and guests are mailed the  */
/*  moment it saves, exactly as when a person books in the app.        */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export async function GET(req: NextRequest) {
  const auth = await authenticateApi(req.headers, "read");
  if (!auth.ok) return auth.response;

  const params = req.nextUrl.searchParams;
  const from = params.get("from") ? new Date(params.get("from")!) : new Date();
  const to = params.get("to") ? new Date(params.get("to")!) : new Date(from.getTime() + 7 * DAY_MS);

  const result = await listEvents(auth.caller, {
    from,
    to,
    scope: params.get("scope") === "all" ? "all" : "me",
    includeCancelled: params.get("includeCancelled") === "true",
  });
  if (!result.success) return apiError(400, result.error);
  return NextResponse.json({ events: result.events });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApi(req.headers, "write");
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body) return apiError(400, "Send a JSON object.");

  // The core validates every field with the same schema the app's dialog uses.
  const result = await createEvent(auth.caller, body as unknown as CreateEventInput);
  if (!result.success) return apiError(400, result.error);
  return NextResponse.json({ eventId: result.data, invites: result.invites }, { status: 201 });
}
