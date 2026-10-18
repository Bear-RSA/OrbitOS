"use server";

import { requireCaller } from "@/lib/auth/caller";
import {
  cancelEvent,
  createEvent,
  getEngagementGuests,
  setRsvp,
  updateEvent,
  type ActionResult,
  type CreateEventResult,
  type GuestsResult,
  type UpdateEventResult,
} from "@/lib/events/core";
import type { CreateEventInput, RsvpStatus, UpdateEventInput } from "@/types/event";

export type { InviteOutcome } from "@/lib/events/core";

/* ------------------------------------------------------------------ */
/*  Engagement Server Actions                                          */
/*                                                                     */
/*  The writes live in `lib/events/core`, shared with the `/api/v1`    */
/*  routes. These only answer "who is calling" from the session cookie */
/*  and hand the caller over.                                          */
/* ------------------------------------------------------------------ */

export async function createEventAction(
  input: CreateEventInput
): Promise<CreateEventResult> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };
  return createEvent(caller, input);
}

export async function updateEventAction(
  eventId: string,
  updates: UpdateEventInput
): Promise<UpdateEventResult> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };
  return updateEvent(caller, eventId, updates);
}

export async function setRsvpAction(
  eventId: string,
  status: RsvpStatus
): Promise<ActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };
  return setRsvp(caller, eventId, status);
}

/** A tombstone rather than a delete, so links and the activity log still resolve. */
export async function cancelEventAction(
  eventId: string
): Promise<ActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };
  return cancelEvent(caller, eventId);
}

export async function getEngagementGuestsAction(
  eventId: string
): Promise<GuestsResult> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };
  return getEngagementGuests(caller, eventId);
}
