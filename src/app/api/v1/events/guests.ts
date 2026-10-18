import type { NextResponse } from "next/server";

import { apiError, type ApiCaller } from "@/lib/api/request";

/**
 * Refuses a booking or edit that names outside guests when the token was
 * not given permission to email people outside the workspace. Returns
 * the response to send, or null to carry on.
 *
 * Checked before the core runs, so a refused request sends nothing.
 */
export function refuseGuestsWithoutScope(
  caller: ApiCaller,
  body: Record<string, unknown>
): NextResponse | null {
  const guests = body.guests;
  const namesGuests = Array.isArray(guests) && guests.length > 0;
  if (!namesGuests || caller.scopes.includes("guests")) return null;
  return apiError(
    403,
    "This token can't invite people outside the workspace. Create a token with that permission in Settings, or book it in the app."
  );
}
