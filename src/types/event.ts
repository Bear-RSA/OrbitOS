import { Timestamp } from "firebase/firestore";
import type { GuestInviteInput } from "@/types/guest";

/* ------------------------------------------------------------------ */
/*  Engagement Schema                                                  */
/*                                                                     */
/*  An engagement is a block of time with people in it. It is a        */
/*  separate collection from `tasks` on purpose: a task owns a day and */
/*  one or two operatives, an engagement owns a span and an attendee   */
/*  list that each answer for themselves. Folding the two together     */
/*  would mean every task carried an unused duration and an unused     */
/*  RSVP map, and every engagement inherited a status model built for  */
/*  work that gets completed rather than attended.                     */
/* ------------------------------------------------------------------ */

/** Per-attendee response. Everyone starts at `pending`. */
export type RsvpStatus = "pending" | "accepted" | "declined" | "tentative";

/**
 * `cancelled` is a tombstone, not a delete — a cancelled engagement stays
 * readable so the activity log and anyone holding a link still resolve.
 */
export type EventStatus = "confirmed" | "cancelled";

/**
 * Where the meeting actually happens.
 *
 *   "orbit"    — OrbitOS hosts it. The engagement owns a room, and the
 *                link in every invitation points back into the app.
 *   "external" — somewhere else; the organizer pasted a link.
 *   "none"     — in person, or nowhere in particular.
 *
 * Engagements written before this field existed have no value. Read them
 * through `effectiveCallProvider` in `lib/calls/scheduled`, which infers
 * "external" from a stored link and "none" otherwise.
 */
export type EngagementCallProvider = "none" | "orbit" | "external";

export interface OrbitEvent {
  id: string;
  orgId: string;
  /** null for an org-wide engagement that belongs to no single project. */
  projectId: string | null;
  title: string;
  description: string;

  /** Inclusive start. */
  startAt: Timestamp;
  /** Exclusive end, following the calendar convention. */
  endAt: Timestamp;
  /**
   * All-day engagements own days rather than instants. The span is still
   * stored so range queries need no special case, but the UI must read
   * `startDateKey` for placement instead of formatting a clock time.
   */
  allDay: boolean;
  /**
   * "YYYY-MM-DD" of `startAt` in `timeZone`. Same contract as a task's
   * `dueDateKey`: this is the authority on which cell the engagement
   * lands in, so the grid never derives a day from a Timestamp.
   */
  startDateKey: string;
  /** IANA zone the engagement was scheduled in, e.g. "Africa/Johannesburg". */
  timeZone: string;

  location: string | null;
  /**
   * The link people click to get in. For an Orbit call this is derived —
   * `/call/{roomId}` on the app's own host — and kept here anyway so the
   * invitation mail, the .ics feed and the RSVP page carry one link
   * without each having to know what kind of call it is.
   */
  meetingUrl: string | null;

  /** Absent on engagements older than calling — see the type's note. */
  callProvider?: EngagementCallProvider;
  /**
   * The room, when `callProvider` is "orbit". Random and server-issued —
   * see `lib/calls/room-id` — never derived from the engagement id.
   */
  roomId?: string | null;
  /**
   * A member has entered the room. This is the gate the walk-in path
   * checks: a forwarded link is inert until somebody who belongs in the
   * meeting has opened it, and inert again once the window closes.
   */
  callActive?: boolean;
  callStartedAt?: Timestamp | null;

  /** Attendee uids. Unlike a task's operatives, this is not capped at two. */
  attendees: string[];
  /** uid → response. Keys track `attendees`; absent is read as `pending`. */
  rsvp: Record<string, RsvpStatus>;

  /**
   * Guest ids (see `types/guest`) for people invited off-platform. Kept in
   * its own field rather than mixed into `attendees` so every existing
   * `array-contains` query on uids keeps its exact meaning — a guest must
   * never satisfy a member lookup.
   */
  guests: string[];
  /** guestId → response. Same contract as `rsvp`, keyed by guest. */
  guestRsvp: Record<string, RsvpStatus>;
  /**
   * guestId → display name, denormalized at write time.
   *
   * A calendar grid renders every participant on every cell. Resolving
   * these through the `guests` collection would be a read per guest per
   * render, and the client would need read access to a collection that
   * is otherwise server-only. A name is cheap to copy and near-static;
   * a rename simply lands on the next write.
   */
  guestNames: Record<string, string>;

  /**
   * RFC 5545 SEQUENCE. Calendar clients dedupe on UID and accept an update
   * only when this is higher than what they already hold, so it has to
   * increment on every change that goes back out as an invite — a
   * reschedule that reuses the old number is silently dropped by Outlook.
   */
  sequence: number;

  status: EventStatus;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/* ------------------------------------------------------------------ */
/*  Action payloads                                                    */
/*                                                                     */
/*  Instants cross the wire as ISO strings and are converted server-   */
/*  side, matching how task due dates are handled.                     */
/* ------------------------------------------------------------------ */

export interface CreateEventInput {
  projectId: string | null;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  timeZone?: string;
  location?: string | null;
  /**
   * Read only when `callProvider` is "external". An Orbit call's link is
   * issued by the server, and an in-person engagement has none.
   */
  meetingUrl?: string | null;
  /** Omitted means "external" when a link was given, "none" otherwise. */
  callProvider?: EngagementCallProvider;
  attendees?: string[];
  /** Off-platform invitees by address; resolved to guest records server-side. */
  guests?: GuestInviteInput[];
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
  timeZone?: string;
  location?: string | null;
  meetingUrl?: string | null;
  callProvider?: EngagementCallProvider;
  attendees?: string[];
  guests?: GuestInviteInput[];
}
