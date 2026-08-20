import type { OrbitEvent } from "@/types/event";

/* ------------------------------------------------------------------ */
/*  Engagement presence                                                */
/*                                                                     */
/*  Derives "in a meeting, right now, with these people" from the      */
/*  schedule that already exists. Nothing is written and nothing is    */
/*  polled — an engagement in the grid IS the presence signal, so this */
/*  cannot drift out of sync with the calendar the way a manually set  */
/*  status does.                                                       */
/*                                                                     */
/*  It deliberately outranks `operationalStatus`. Someone who last     */
/*  clicked "available" an hour ago and is in a client call right now  */
/*  is not available, and the calendar is the better authority.        */
/* ------------------------------------------------------------------ */

export interface EngagementPresence {
  eventId: string;
  title: string;
  /** Everyone else in the room, members and guests alike. */
  withNames: string[];
  /** True when anyone in the room is from outside the workspace. */
  hasGuests: boolean;
  endsAt: Date;
  /** "in a meeting with Sarah Klein" — ready to drop into a sentence. */
  label: string;
}

/**
 * Joins names the way a person would say them, capping the list before it
 * stops being a sentence and starts being a table.
 */
export function joinNames(names: string[], max = 2): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length <= max) {
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }

  const rest = names.length - max;
  return `${names.slice(0, max).join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`;
}

/**
 * The engagement this operative is inside at `now`, or null.
 *
 * All-day engagements are ignored on purpose: an all-day block is a
 * marker for the day, not a room someone is sitting in, and treating it
 * as presence would show a person "in a meeting" from midnight to
 * midnight.
 */
export function currentEngagement(
  events: OrbitEvent[],
  uid: string,
  memberNames: Record<string, string>,
  now: Date = new Date()
): EngagementPresence | null {
  const millis = now.getTime();

  const live = events.filter((event) => {
    if (event.status === "cancelled") return false;
    if (event.allDay) return false;
    if (!event.attendees?.includes(uid)) return false;

    // Someone who declined is not in the room.
    if (event.rsvp?.[uid] === "declined") return false;

    return event.startAt.toMillis() <= millis && event.endAt.toMillis() > millis;
  });

  if (live.length === 0) return null;

  // Double-booked: the one ending soonest is the one they are in now.
  live.sort((a, b) => a.endAt.toMillis() - b.endAt.toMillis());
  const event = live[0];

  const guestIds = event.guests ?? [];
  const guestNames = event.guestNames ?? {};

  const memberSide = event.attendees
    .filter((id) => id !== uid && event.rsvp?.[id] !== "declined")
    .map((id) => memberNames[id])
    .filter((name): name is string => Boolean(name));

  const guestSide = guestIds
    .filter((id) => event.guestRsvp?.[id] !== "declined")
    .map((id) => guestNames[id] || "Guest");

  const withNames = [...memberSide, ...guestSide];

  return {
    eventId: event.id,
    title: event.title,
    withNames,
    hasGuests: guestSide.length > 0,
    endsAt: event.endAt.toDate(),
    label:
      withNames.length > 0
        ? `in a meeting with ${joinNames(withNames)}`
        : "in a meeting",
  };
}

/**
 * Presence for a whole roster in one pass.
 *
 * Callers render a personnel list, so doing this per member would walk
 * the event array once per person. Keyed by uid, absent when free.
 */
export function engagementPresenceByMember(
  events: OrbitEvent[],
  uids: string[],
  memberNames: Record<string, string>,
  now: Date = new Date()
): Record<string, EngagementPresence> {
  const result: Record<string, EngagementPresence> = {};

  for (const uid of uids) {
    const presence = currentEngagement(events, uid, memberNames, now);
    if (presence) result[uid] = presence;
  }

  return result;
}
