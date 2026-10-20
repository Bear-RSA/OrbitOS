/* ------------------------------------------------------------------ */
/*  API cost ceilings                                                  */
/*                                                                     */
/*  ALWAYS on, independent of BILLING_GUARDRAILS_ENABLED — the same    */
/*  split `lib/calls/ceiling` makes. The caller on the other end of a  */
/*  token is usually a program, and a program stuck in a loop does not */
/*  get bored. Every request is Firestore reads on the Blaze invoice,  */
/*  so these hold whether or not the paywall is switched on.           */
/*                                                                     */
/*  The tier limit in `resolveApiTokenLimit` narrows the token count;  */
/*  nothing ever widens these.                                         */
/* ------------------------------------------------------------------ */

/** Tokens one person may hold at once, whatever the plan says. */
export const HARD_MAX_TOKENS_PER_USER = 10;

/**
 * Requests one token may make in a minute. An assistant answering a
 * question makes a handful; sixty is room for a busy one and a hard stop
 * for a runaway one.
 */
export const HARD_MAX_REQUESTS_PER_MINUTE = 60;

/**
 * Writes one token may make in a day. Each write is a Firestore write
 * plus an activity-log entry, and each assignment can land in somebody
 * else's debrief, so writes get their own, lower ceiling.
 */
export const HARD_MAX_WRITES_PER_DAY = 500;

/**
 * Meeting changes one token may make in a day: book, reschedule,
 * cancel, RSVP. Each one mails people, so these are counted on their own
 * and well under the general write ceiling — 500 bookings a day would be
 * a mailing list, not a calendar.
 */
export const HARD_MAX_MAIL_WRITES_PER_DAY = 30;

/**
 * Largest request body the API reads. The biggest legitimate body is a
 * 5,000-character note; this leaves room and refuses a payload sized to
 * waste memory.
 */
export const MAX_BODY_BYTES = 32_768;

/**
 * Failed authentications one address may make in a minute before it is
 * refused without a lookup. Per server instance and best effort — it is
 * there to keep a script cycling guesses from costing a Firestore read
 * each, not to be what stops guessing (256 random bits do that).
 */
export const MAX_AUTH_FAILURES_PER_MINUTE = 20;

/** Longest name a token may carry. */
export const MAX_TOKEN_NAME_LENGTH = 60;

/** Most rows a list endpoint returns in one response. */
export const MAX_LIST_LIMIT = 200;

/**
 * The tokens this person may hold: the narrower of the plan and the
 * ceiling. `tierLimit` of -1 means the plan does not narrow it.
 */
export function effectiveTokenLimit(tierLimit: number): number {
  if (!Number.isFinite(tierLimit)) return 0;
  if (tierLimit === -1) return HARD_MAX_TOKENS_PER_USER;
  return Math.max(0, Math.min(Math.floor(tierLimit), HARD_MAX_TOKENS_PER_USER));
}

/** Clamps a requested page size into 1..MAX_LIST_LIMIT, defaulting to 50. */
export function capListLimit(requested: unknown): number {
  const n = typeof requested === "string" ? Number(requested) : requested;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 1) return 50;
  return Math.min(Math.floor(n), MAX_LIST_LIMIT);
}

export interface ThrottleWindow {
  minuteStart: number;
  minuteCount: number;
  dayStart: number;
  writeCount: number;
  mailCount: number;
}

/** What a request costs: a read, a write, or a write that sends mail. */
export type RequestKind = "read" | "write" | "mail";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * Admits or refuses one request against a throttle window, returning the
 * window to store. Pure, so the arithmetic is tested without Firestore.
 * Expired windows reset rather than accumulate.
 */
export function admitRequest(
  previous: Partial<ThrottleWindow> | undefined,
  kind: RequestKind,
  now: number
): { allowed: boolean; reason?: "minute" | "writes" | "mail"; window: ThrottleWindow } {
  const window: ThrottleWindow = {
    minuteStart: typeof previous?.minuteStart === "number" ? previous.minuteStart : now,
    minuteCount: typeof previous?.minuteCount === "number" ? previous.minuteCount : 0,
    dayStart: typeof previous?.dayStart === "number" ? previous.dayStart : now,
    writeCount: typeof previous?.writeCount === "number" ? previous.writeCount : 0,
    mailCount: typeof previous?.mailCount === "number" ? previous.mailCount : 0,
  };
  const isWrite = kind !== "read";

  if (now - window.minuteStart >= MINUTE_MS || now < window.minuteStart) {
    window.minuteStart = now;
    window.minuteCount = 0;
  }
  if (now - window.dayStart >= DAY_MS || now < window.dayStart) {
    window.dayStart = now;
    window.writeCount = 0;
    window.mailCount = 0;
  }

  if (window.minuteCount >= HARD_MAX_REQUESTS_PER_MINUTE) {
    return { allowed: false, reason: "minute", window };
  }
  if (isWrite && window.writeCount >= HARD_MAX_WRITES_PER_DAY) {
    return { allowed: false, reason: "writes", window };
  }
  if (kind === "mail" && window.mailCount >= HARD_MAX_MAIL_WRITES_PER_DAY) {
    return { allowed: false, reason: "mail", window };
  }

  window.minuteCount += 1;
  if (isWrite) window.writeCount += 1;
  if (kind === "mail") window.mailCount += 1;
  return { allowed: true, window };
}

/**
 * Per-address failure counter for one server instance. Pure apart from
 * the map it is handed, so the window logic is testable.
 */
export function recordAuthFailure(
  failures: Map<string, { start: number; count: number }>,
  address: string,
  now: number
): void {
  const entry = failures.get(address);
  if (!entry || now - entry.start >= MINUTE_MS) {
    failures.set(address, { start: now, count: 1 });
  } else {
    entry.count += 1;
  }
  // Keep the map from growing without bound on a long-lived instance.
  if (failures.size > 5_000) {
    for (const [key, value] of failures) {
      if (now - value.start >= MINUTE_MS) failures.delete(key);
    }
  }
}

export function isAddressBlocked(
  failures: Map<string, { start: number; count: number }>,
  address: string,
  now: number
): boolean {
  const entry = failures.get(address);
  return Boolean(entry && now - entry.start < MINUTE_MS && entry.count >= MAX_AUTH_FAILURES_PER_MINUTE);
}
