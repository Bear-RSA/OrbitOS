import type { CallStatus } from "@/types/call";

/* ------------------------------------------------------------------ */
/*  Call access decisions                                              */
/*                                                                     */
/*  Every "may this person enter this room" question, as pure           */
/*  functions over plain values. Nothing here reads Firestore, calls a */
/*  provider, or knows what a session is — the actions gather the      */
/*  facts, these decide.                                               */
/*                                                                     */
/*  Split out for the same reason `events/engagement-form` was: the    */
/*  cost of getting one of these wrong is a stranger in a meeting or a */
/*  member locked out of their own call, and neither shows up in a     */
/*  screenshot. They are the part worth testing directly.              */
/* ------------------------------------------------------------------ */

/**
 * How early someone may enter a scheduled call, and how long the room
 * stays open after the scheduled end.
 *
 * Early entry is generous because people join meetings early; the tail
 * is longer still because meetings run over, and being ejected mid-
 * sentence by a calendar entry is worse than a few idle minutes.
 */
export const JOIN_WINDOW_BEFORE_MS = 10 * 60_000;
export const JOIN_WINDOW_AFTER_MS = 30 * 60_000;

export type JoinRefusal =
  | "not-a-call"
  | "not-invited"
  | "not-started"
  | "ended"
  | "tier";

export type JoinDecision =
  | { allowed: true }
  | { allowed: false; reason: JoinRefusal; message: string };

const ALLOWED: JoinDecision = { allowed: true };

function refuse(reason: JoinRefusal, message: string): JoinDecision {
  return { allowed: false, reason, message };
}

/* ------------------------------------------------------------------ */
/*  Scheduled calls                                                    */
/* ------------------------------------------------------------------ */

export interface ScheduledCallFacts {
  callProvider: "none" | "orbit" | "external";
  roomId: string | null;
  cancelled: boolean;
  startAtMs: number;
  endAtMs: number;
  /** True when the subject is on the attendee or guest list. */
  onTheList: boolean;
}

/**
 * Whether an invited subject — member or guest — may enter a scheduled
 * call right now.
 *
 * The window is the interesting part. An engagement is a room that
 * exists for a bounded time, and without that bound a link mailed for a
 * Tuesday standup is a permanent open door into the workspace.
 */
export function canJoinScheduledCall(
  facts: ScheduledCallFacts,
  now: number = Date.now()
): JoinDecision {
  if (facts.callProvider !== "orbit" || !facts.roomId) {
    return refuse("not-a-call", "This engagement is not an Orbit call.");
  }
  if (facts.cancelled) {
    return refuse("ended", "This engagement was cancelled.");
  }
  if (!facts.onTheList) {
    return refuse("not-invited", "You are not on this engagement.");
  }
  if (now < facts.startAtMs - JOIN_WINDOW_BEFORE_MS) {
    return refuse("not-started", "This call has not opened yet.");
  }
  if (now > facts.endAtMs + JOIN_WINDOW_AFTER_MS) {
    return refuse("ended", "This call has ended.");
  }
  return ALLOWED;
}

/* ------------------------------------------------------------------ */
/*  Walk-ins                                                           */
/* ------------------------------------------------------------------ */

export interface WalkInFacts extends ScheduledCallFacts {
  /** A member has actually started the call. */
  callActive: boolean;
  /** From `resolveCallLimits`. -1 means the tier does not narrow it. */
  maxGuests: number;
}

/**
 * Whether someone holding only a room link may type a name and enter.
 *
 * Three things bound this, and all three are load-bearing. The room id
 * is unguessable, so the link had to be given to them. The call must be
 * LIVE — a forwarded link is inert outside the meeting itself, which is
 * what stops an old link becoming a standing invitation. And the plan
 * must allow outsiders at all.
 *
 * `onTheList` is not consulted: a walk-in is by definition not on it.
 */
export function canWalkIn(facts: WalkInFacts, now: number = Date.now()): JoinDecision {
  if (facts.callProvider !== "orbit" || !facts.roomId) {
    return refuse("not-a-call", "This link does not point at a call.");
  }
  if (facts.cancelled) {
    return refuse("ended", "This call was cancelled.");
  }
  if (facts.maxGuests === 0) {
    return refuse("tier", "This workspace's plan does not allow outside guests in calls.");
  }
  if (!facts.callActive) {
    return refuse("not-started", "This call has not started yet.");
  }
  if (now > facts.endAtMs + JOIN_WINDOW_AFTER_MS) {
    return refuse("ended", "This call has ended.");
  }
  return ALLOWED;
}

/* ------------------------------------------------------------------ */
/*  Direct calls                                                       */
/* ------------------------------------------------------------------ */

export interface DirectCallFacts {
  callerOrgId: string;
  targetOrgId: string;
  callerUid: string;
  targetUid: string;
  /** From `resolveCallLimits`. */
  maxParticipants: number;
  /** Direct calls already ringing or live in this workspace. */
  activeDirectCalls: number;
  /** The always-on ceiling from `lib/calls/ceiling`. */
  hardMaxConcurrent: number;
}

/**
 * Whether one member may ring another.
 *
 * The org check is the whole security model for direct calls — the
 * Operational Load Grid is the boundary, and reusing `caller.orgId ===
 * target.orgId` keeps it the same boundary every other action enforces.
 */
export function canStartDirectCall(facts: DirectCallFacts): JoinDecision {
  if (!facts.callerOrgId || facts.callerOrgId !== facts.targetOrgId) {
    return refuse("not-invited", "You can only call people in your workspace.");
  }
  if (facts.callerUid === facts.targetUid) {
    return refuse("not-invited", "You cannot call yourself.");
  }
  /* A direct call is exactly two people, so a tier that allows fewer than
     two allows no call at all. Checked rather than assumed, because the
     tier table is edited by hand. */
  if (facts.maxParticipants !== -1 && facts.maxParticipants < 2) {
    return refuse("tier", "Your plan does not include calling.");
  }
  if (facts.activeDirectCalls >= facts.hardMaxConcurrent) {
    return refuse("tier", "Too many calls are already running in this workspace.");
  }
  return ALLOWED;
}

/**
 * Whether a ringing call may still be answered.
 *
 * Expiry is enforced here rather than by a cleanup job, which is what
 * makes the absence of a cron safe: a `ringing` row nobody tidied up is
 * already unanswerable by this function.
 */
export function canAnswerCall(
  status: CallStatus,
  ringingExpiresAtMs: number,
  now: number = Date.now()
): JoinDecision {
  if (status === "active") return ALLOWED; // rejoining a call already picked up
  if (status !== "ringing") {
    return refuse("ended", "This call is no longer ringing.");
  }
  if (now > ringingExpiresAtMs) {
    return refuse("ended", "This call timed out.");
  }
  return ALLOWED;
}
