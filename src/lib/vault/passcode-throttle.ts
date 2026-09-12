import { createHash } from "crypto";
import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";

/* ------------------------------------------------------------------ */
/*  Vault passcode ceilings                                            */
/*                                                                     */
/*  Modeled directly on `lib/auth/reset-throttle.ts` — a rolling window */
/*  claimed inside a Firestore transaction, keyed by a hashed identity   */
/*  so this collection cannot become a readable list of who has been     */
/*  guessing. Two ceilings for two different attacks:                    */
/*                                                                       */
/*    attempt — a wrong guess at the 4-digit code. 10,000 possible        */
/*    codes is nothing against an unthrottled endpoint, so this is the    */
/*    ceiling the whole feature rests on.                                 */
/*                                                                       */
/*    reset   — the emailed owner "forgot passcode" loop. Lower and       */
/*    daily, the same shape as the account password reset's per-address   */
/*    ceiling, because it is also a billed Resend send.                   */
/* ------------------------------------------------------------------ */

const COLLECTION = "vault_passcode_throttle";

/** Enough for someone who mistyped twice, not enough to work the keyspace. */
export const HARD_MAX_ATTEMPTS_PER_WINDOW = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export const HARD_MAX_RESETS_PER_DAY = 3;
const RESET_WINDOW_MS = 24 * 60 * 60 * 1000;

function keyFor(kind: "attempt" | "reset", value: string): string {
  const digest = createHash("sha256").update(`${kind}:${value}`).digest("hex");
  return `${kind}_${digest.slice(0, 40)}`;
}

interface WindowState {
  windowStart: Timestamp;
  count: number;
}

function freshWindow(now: Date): WindowState {
  return { windowStart: Timestamp.fromDate(now), count: 0 };
}

function readWindow(
  data: FirebaseFirestore.DocumentData | undefined,
  now: Date,
  windowMs: number
): WindowState {
  if (!data) return freshWindow(now);

  const windowStart =
    data.windowStart instanceof Timestamp ? data.windowStart : Timestamp.fromDate(now);
  const count = typeof data.count === "number" ? data.count : 0;

  if (now.getTime() - windowStart.toDate().getTime() >= windowMs) {
    return freshWindow(now);
  }

  return { windowStart, count };
}

/**
 * Claims one attempt against a ceiling, or refuses.
 *
 * Runs in a transaction for the same reason the password reset throttle
 * does: two attempts arriving together must not both read the same count
 * and both decide they are under it.
 */
async function claim(key: string, max: number, windowMs: number, now: Date): Promise<boolean> {
  const ref = adminDb.collection(COLLECTION).doc(key);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const state = readWindow(snap.data(), now, windowMs);

    if (state.count >= max) return false;

    tx.set(ref, {
      windowStart: state.windowStart,
      count: state.count + 1,
      updatedAt: Timestamp.fromDate(now),
    });

    return true;
  });
}

export type ThrottleVerdict = "allowed" | "locked" | "unavailable";

/**
 * Claims one wrong-guess slot for this member on this workspace's Vault.
 *
 * Throws are treated as a refusal, not a pass — an unmetered PIN endpoint
 * is exactly the failure this exists to prevent, and a Firestore outage
 * takes the rest of the app down with it anyway.
 */
export async function claimPasscodeAttempt(
  uid: string,
  orgId: string,
  now: Date = new Date()
): Promise<ThrottleVerdict> {
  try {
    const allowed = await claim(
      keyFor("attempt", `${orgId}:${uid}`),
      HARD_MAX_ATTEMPTS_PER_WINDOW,
      ATTEMPT_WINDOW_MS,
      now
    );
    return allowed ? "allowed" : "locked";
  } catch (err) {
    console.error("[VaultPasscode] Could not claim an attempt:", err);
    return "unavailable";
  }
}

/** Clears the wrong-guess count on a correct entry, so the next mistake gets a full window. */
export async function clearPasscodeAttempts(uid: string, orgId: string): Promise<void> {
  try {
    await adminDb.collection(COLLECTION).doc(keyFor("attempt", `${orgId}:${uid}`)).delete();
  } catch (err) {
    console.error("[VaultPasscode] Could not clear the attempt counter:", err);
  }
}

/** Claims one "forgot passcode" email for this workspace today. */
export async function claimPasscodeResetRequest(
  orgId: string,
  now: Date = new Date()
): Promise<ThrottleVerdict> {
  try {
    const allowed = await claim(
      keyFor("reset", orgId),
      HARD_MAX_RESETS_PER_DAY,
      RESET_WINDOW_MS,
      now
    );
    return allowed ? "allowed" : "locked";
  } catch (err) {
    console.error("[VaultPasscode] Could not claim a reset request:", err);
    return "unavailable";
  }
}
