import type { EngagementCallProvider } from "@/types/event";
import { getAppUrl } from "@/lib/utils/getAppUrl";
import { JOIN_WINDOW_AFTER_MS } from "./access";
import { HARD_MAX_PARTICIPANTS, HARD_MAX_ROOM_MINUTES, groupCallSeats } from "./ceiling";

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
 * How long a pass minted now should last: the full room ceiling, or
 * until the scheduled end plus the late-entry grace if that is later.
 *
 * The calendar end is when people meant to stop, not when they do. It
 * used to be the deadline, and the room is sized once, by whoever joins
 * first, so a 30-minute meeting that started on time ejected everyone at
 * the 60-minute mark mid-sentence. Cost is still bounded: the ceilings
 * clamp this downstream, so a room nobody hangs up still closes.
 */
export function scheduledCallMinutes(endAtMs: number, now: number = Date.now()): number {
  const remaining = Math.ceil((endAtMs + JOIN_WINDOW_AFTER_MS - now) / 60_000);
  return Math.max(HARD_MAX_ROOM_MINUTES, remaining);
}
