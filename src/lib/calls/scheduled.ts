import type { EngagementCallProvider } from "@/types/event";
import { getAppUrl } from "@/lib/utils/getAppUrl";
import { JOIN_WINDOW_AFTER_MS } from "./access";
import { HARD_MAX_PARTICIPANTS, groupCallSeats } from "./ceiling";

/* ------------------------------------------------------------------ */
/*  Scheduled calls                                                    */
/*                                                                     */
/*  The pure half of an engagement that owns a room: what kind of      */
/*  call it is, where its link points, how big the room should be and  */
/*  how long a pass into it should last. Nothing here reads Firestore  */
/*  or talks to a provider, so the calendar, the join page and the     */
/*  server actions can all ask the same questions and get the same     */
/*  answers.                                                           */
/* ------------------------------------------------------------------ */

/** The fields this module reads off an engagement, from either SDK. */
export interface CallShapedEvent {
  callProvider?: EngagementCallProvider | null;
  meetingUrl?: string | null;
  roomId?: string | null;
}

/**
 * What kind of call an engagement is, including ones written before the
 * field existed.
 *
 * Those carry no `callProvider`, and the honest reading of them is the
 * one the old form implied: a link meant "somewhere else", no link meant
 * "in person". Stored values always win over the inference — an Orbit
 * call has a link too, and reading it as external would send people to
 * a page that then asks them to sign in for nothing.
 */
export function effectiveCallProvider(event: CallShapedEvent): EngagementCallProvider {
  if (event.callProvider) return event.callProvider;
  return event.meetingUrl ? "external" : "none";
}

/** True when the engagement is hosted here and has a room to enter. */
export function isOrbitCall(
  event: CallShapedEvent
): event is CallShapedEvent & { roomId: string } {
  return effectiveCallProvider(event) === "orbit" && Boolean(event.roomId);
}

/**
 * The in-app path a room lives at. Every entry point — a member from the
 * calendar, a guest from their invitation, a walk-in from a forwarded
 * link — arrives here, and the page decides which of the three it is
 * looking at.
 */
export function scheduledCallPath(roomId: string): string {
  return `/call/${roomId}`;
}

/**
 * The absolute link written onto the engagement.
 *
 * Absolute rather than relative because it leaves the app: it goes into
 * the invitation mail, the .ics attachment and every subscribed calendar
 * feed, none of which know what host to prepend.
 */
export function scheduledCallUrl(roomId: string): string {
  return `${getAppUrl().replace(/\/$/, "")}${scheduledCallPath(roomId)}`;
}

/**
 * Seats in a scheduled call's room.
 *
 * The plan's cap, not the size of the invitation list. The room is
 * created when the first person joins and `createRoom` is get-or-create,
 * so the size it is given then is the size it keeps — and the list does
 * not stay still: somebody in the call rings a colleague in, a walk-in
 * arrives off a forwarded link. A room sized to the list at the moment
 * it was built would turn away exactly the people the plan allows.
 * Seats nobody sits in cost nothing; only bodies are billed.
 */
export function scheduledCallSeats(limits: { maxParticipants: number }): number {
  return groupCallSeats(HARD_MAX_PARTICIPANTS, limits.maxParticipants);
}

/**
 * How long a pass minted now should last: until the room closes, which
 * is the scheduled end plus the same grace `canJoinScheduledCall`
 * allows for late entry. Whole minutes, never less than one, and the
 * ceilings clamp it again downstream — a 6-hour engagement still gets
 * tokens that expire and rooms that eject.
 */
export function scheduledCallMinutes(endAtMs: number, now: number = Date.now()): number {
  const remaining = endAtMs + JOIN_WINDOW_AFTER_MS - now;
  return Math.max(1, Math.ceil(remaining / 60_000));
}
