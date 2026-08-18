import { Timestamp } from "firebase/firestore";

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
  meetingUrl: string | null;

  /** Attendee uids. Unlike a task's operatives, this is not capped at two. */
  attendees: string[];
  /** uid → response. Keys track `attendees`; absent is read as `pending`. */
  rsvp: Record<string, RsvpStatus>;

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
  meetingUrl?: string | null;
  attendees?: string[];
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
  attendees?: string[];
}
