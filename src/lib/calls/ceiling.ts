/* ------------------------------------------------------------------ */
/*  Call cost ceilings                                                 */
/*                                                                     */
/*  ALWAYS on, independent of BILLING_GUARDRAILS_ENABLED — the same    */
/*  split the invite dispatcher and the telemetry stream guard already */
/*  make. A call is billed in participant-minutes, so every one of     */
/*  these maps to a line on a Daily invoice rather than to a seat.     */
/*                                                                     */
/*  The tier limits in `resolveCallLimits` narrow these; nothing ever  */
/*  widens them. A tier returning -1 means "the plan does not narrow   */
/*  it", not "unlimited" — there is no unlimited here, because the     */
/*  bill is real whether or not the paywall is switched on.            */
/* ------------------------------------------------------------------ */

/**
 * Bodies in one room. Well above any plausible studio standup and well
 * below the point where one forgotten room becomes a serious invoice.
 */
export const HARD_MAX_PARTICIPANTS = 12;

/**
 * How long a room stays usable after it is created.
 *
 * This is the backstop for the failure that actually costs money: a room
 * nobody hangs up. The provider ejects everyone at expiry, so an
 * abandoned tab cannot bill overnight.
 */
export const HARD_MAX_ROOM_MINUTES = 240;

/**
 * Lifetime of an access token.
 *
 * Shorter than the room on purpose. A token is the thing that leaks —
 * it rides in a URL, sits in a browser history, gets pasted into a
 * message — and a leaked token that outlives the meeting is a stranger
 * in the next one held in that room.
 */
export const HARD_MAX_TOKEN_SECONDS = 7_200;

/**
 * Direct calls one workspace may have running at once.
 *
 * Scheduled calls are not counted: those are bounded by the calendar,
 * which a person had to fill in. A direct call is one click, which makes
 * it the one an accident or a loop can multiply.
 */
export const HARD_MAX_CONCURRENT_DIRECT_CALLS = 10;

/**
 * How long a direct call rings before it can no longer be answered.
 *
 * Enforced server-side at answer time rather than by a cleanup job. A
 * `ringing` document that nobody tidied up is already unanswerable, so
 * the absence of a cron is not a hole.
 */
export const RING_TIMEOUT_SECONDS = 45;

/**
 * Group calls one workspace may have running at once.
 *
 * Lower than the direct-call ceiling, and the arithmetic is why: a
 * direct call is two people, a group call is up to twelve, so five of
 * these can already cost more than ten of those. It is also the harder
 * one to notice — a direct call ends when one of two people hangs up,
 * while a room beside a thread stays open until the last person
 * remembers to leave.
 */
export const HARD_MAX_CONCURRENT_GROUP_CALLS = 5;

/**
 * How long a group call room lives.
 *
 * The backstop for the failure this feature actually has: nobody hangs
 * up. A group call has no callee to decline it and no calendar entry to
 * end it, so the expiry is the only thing that ever closes the room —
 * which is why the deadline is written onto the conversation and read
 * by every surface, rather than left to the provider alone.
 */
export const GROUP_CALL_MINUTES = 120;

/**
 * Seats in a group call room.
 *
 * The narrowest of three numbers: how many people are in the thread,
 * what the plan allows, and the always-on ceiling. Nobody outside the
 * conversation can join, so a room sized for the plan when the group
 * holds four people is just a larger bill waiting for a mistake.
 *
 * `tierMax` of -1 means the plan does not narrow it — not unlimited.
 */
export function groupCallSeats(groupSize: number, tierMax: number): number {
  const size = Number.isFinite(groupSize) ? Math.floor(groupSize) : 2;
  const wanted = tierMax === -1 ? size : Math.min(size, Math.floor(tierMax));
  return capParticipants(wanted);
}

/** Clamps a requested participant cap to the ceiling. */
export function capParticipants(requested: number): number {
  if (!Number.isFinite(requested) || requested < 2) return 2;
  return Math.min(Math.floor(requested), HARD_MAX_PARTICIPANTS);
}

/** Clamps a requested token lifetime to the ceiling. */
export function capTokenSeconds(requested: number): number {
  if (!Number.isFinite(requested) || requested < 60) return 60;
  return Math.min(Math.floor(requested), HARD_MAX_TOKEN_SECONDS);
}

/** Clamps a room expiry to the ceiling, measured from now. */
export function capRoomExpiry(requested: Date, now: Date = new Date()): Date {
  const ceiling = new Date(now.getTime() + HARD_MAX_ROOM_MINUTES * 60_000);
  const floor = new Date(now.getTime() + 60_000);

  if (!(requested instanceof Date) || Number.isNaN(requested.getTime())) return ceiling;
  if (requested > ceiling) return ceiling;
  if (requested < floor) return floor;
  return requested;
}
