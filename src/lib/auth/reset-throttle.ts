import { createHash } from "crypto";
import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";

/* ------------------------------------------------------------------ */
/*  Password reset ceilings                                            */
/*                                                                     */
/*  ALWAYS on, and deliberately not a tier limit — the same split       */
/*  `lib/calls/ceiling` makes. Every reset email is a billed Resend     */
/*  send on an endpoint that takes an arbitrary address from an         */
/*  unauthenticated caller, which is the shape that turns into an       */
/*  invoice fastest. Nothing widens these.                              */
/*                                                                     */
/*  Two keys, because they stop different things. The per-address       */
/*  ceiling stops one mailbox being buried by someone typing a          */
/*  stranger's address into the form; the per-IP ceiling stops one      */
/*  caller cycling through many addresses to burn quota.                */
/* ------------------------------------------------------------------ */

const COLLECTION = "password_reset_throttle";

/** Enough for a genuine "it didn't arrive, resend" without being a tap. */
export const HARD_MAX_PER_EMAIL_HOUR = 3;
export const HARD_MAX_PER_EMAIL_DAY = 10;

/**
 * Higher than the per-address ceiling because a household, an office, or
 * a mobile carrier NAT can legitimately share one address.
 */
export const HARD_MAX_PER_IP_HOUR = 12;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Keys are hashed so this collection never becomes a readable list of
 * the addresses people have tried to recover — which is exactly the
 * inventory the uniform-success contract elsewhere exists to withhold.
 */
function keyFor(kind: "email" | "ip", value: string): string {
  const digest = createHash("sha256")
    .update(`${kind}:${value.trim().toLowerCase()}`)
    .digest("hex");
  return `${kind}_${digest.slice(0, 40)}`;
}

interface Ceiling {
  perHour: number;
  /** Omitted where only an hourly ceiling applies. */
  perDay?: number;
}

interface WindowState {
  hourStart: Timestamp;
  hourCount: number;
  dayStart: Timestamp;
  dayCount: number;
}

function freshWindow(now: Date): WindowState {
  const stamp = Timestamp.fromDate(now);
  return { hourStart: stamp, hourCount: 0, dayStart: stamp, dayCount: 0 };
}

function readWindow(data: FirebaseFirestore.DocumentData | undefined, now: Date): WindowState {
  if (!data) return freshWindow(now);

  const state: WindowState = {
    hourStart: data.hourStart instanceof Timestamp ? data.hourStart : Timestamp.fromDate(now),
    hourCount: typeof data.hourCount === "number" ? data.hourCount : 0,
    dayStart: data.dayStart instanceof Timestamp ? data.dayStart : Timestamp.fromDate(now),
    dayCount: typeof data.dayCount === "number" ? data.dayCount : 0,
  };

  // Expired windows reset rather than accumulate, so a quiet week does
  // not leave a stale count standing between someone and their account.
  if (now.getTime() - state.hourStart.toDate().getTime() >= HOUR_MS) {
    state.hourStart = Timestamp.fromDate(now);
    state.hourCount = 0;
  }
  if (now.getTime() - state.dayStart.toDate().getTime() >= DAY_MS) {
    state.dayStart = Timestamp.fromDate(now);
    state.dayCount = 0;
  }

  return state;
}

/**
 * Claims one send against a ceiling, or refuses.
 *
 * Runs in a transaction: two requests arriving together must not both
 * read the same count and both decide they are under it.
 *
 * Throws if Firestore is unreachable. Callers treat that as a refusal
 * rather than waving the send through — an unmetered spend endpoint is
 * the failure this file exists to prevent, and a Firestore outage takes
 * the rest of the app down with it anyway.
 */
async function claim(key: string, ceiling: Ceiling, now: Date): Promise<boolean> {
  const ref = adminDb.collection(COLLECTION).doc(key);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const state = readWindow(snap.data(), now);

    if (state.hourCount >= ceiling.perHour) return false;
    if (ceiling.perDay !== undefined && state.dayCount >= ceiling.perDay) return false;

    tx.set(ref, {
      ...state,
      hourCount: state.hourCount + 1,
      dayCount: state.dayCount + 1,
      updatedAt: Timestamp.fromDate(now),
    });

    return true;
  });
}

export type ThrottleVerdict = "allowed" | "email-limited" | "ip-limited" | "unavailable";

/**
 * Checks both ceilings for one reset request.
 *
 * The IP ceiling is claimed first. Claiming the address first would let a
 * caller cycling through addresses spend one claim per mailbox before the
 * IP ceiling ever caught them, leaving a trail of half-consumed limits on
 * mailboxes belonging to people who never asked for anything.
 */
export async function claimResetSend(
  email: string,
  ip: string | null,
  now: Date = new Date()
): Promise<ThrottleVerdict> {
  try {
    if (ip) {
      const ipAllowed = await claim(keyFor("ip", ip), { perHour: HARD_MAX_PER_IP_HOUR }, now);
      if (!ipAllowed) return "ip-limited";
    }

    const emailAllowed = await claim(
      keyFor("email", email),
      { perHour: HARD_MAX_PER_EMAIL_HOUR, perDay: HARD_MAX_PER_EMAIL_DAY },
      now
    );

    return emailAllowed ? "allowed" : "email-limited";
  } catch (err) {
    console.error("[ResetThrottle] Could not claim a send:", err);
    return "unavailable";
  }
}
