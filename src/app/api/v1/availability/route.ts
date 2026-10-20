import { NextResponse } from "next/server";

import { apiError, apiRoute } from "@/lib/api/request";
import { getAvailability } from "@/lib/calendar/free-busy";

/* ------------------------------------------------------------------ */
/*  POST /api/v1/availability — free slots for a set of people         */
/*                                                                     */
/*  A read, sent as POST because it carries a list of people. The      */
/*  caller is always included; everyone named must be in the same      */
/*  workspace.                                                         */
/* ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTENDEES = 50;

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export const POST = apiRoute({ scope: "read", kind: "read" }, async ({ caller, body }) => {
  if (!body) return apiError(400, "Send a JSON object.");

  const attendees = body.attendees ?? [];
  if (
    !Array.isArray(attendees) ||
    attendees.length > MAX_ATTENDEES ||
    attendees.some((id) => typeof id !== "string")
  ) {
    return apiError(400, `"attendees" must be up to ${MAX_ATTENDEES} member ids.`);
  }
  if (typeof body.from !== "string" || typeof body.to !== "string") {
    return apiError(400, '"from" and "to" must be ISO date-times.');
  }
  const durationMins = optionalNumber(body.durationMins);
  if (durationMins === undefined) return apiError(400, '"durationMins" is required.');

  const result = await getAvailability(caller.uid, {
    attendees: attendees as string[],
    from: body.from,
    to: body.to,
    durationMins,
    bufferMins: optionalNumber(body.bufferMins),
    minimumNoticeMins: optionalNumber(body.minimumNoticeMins),
    granularityMins: optionalNumber(body.granularityMins),
    limit: Math.min(optionalNumber(body.limit) ?? 12, 50),
  });
  if (!result.success) return apiError(400, result.error);
  return NextResponse.json(result.data);
});
