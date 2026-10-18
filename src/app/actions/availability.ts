"use server";

import { requireServerUid } from "@/lib/auth/session";
import {
  getAvailability,
  type AvailabilityRequest,
  type AvailabilityResult,
} from "@/lib/calendar/free-busy";

export type {
  AvailabilityData,
  AvailabilityRequest,
  AvailabilitySlot,
} from "@/lib/calendar/free-busy";

/* ------------------------------------------------------------------ */
/*  Availability                                                       */
/*                                                                     */
/*  The search lives in `lib/calendar/free-busy`, shared with the API. */
/*  The organizer comes from the session.                              */
/* ------------------------------------------------------------------ */

export async function getAvailabilityAction(
  request: AvailabilityRequest
): Promise<AvailabilityResult> {
  let uid: string;
  try {
    uid = await requireServerUid();
  } catch {
    return { success: false, error: "Your session has expired. Sign in again." };
  }
  return getAvailability(uid, request);
}
