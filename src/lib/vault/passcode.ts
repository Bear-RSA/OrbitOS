import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/* ------------------------------------------------------------------ */
/*  Vault passcode hashing                                             */
/*                                                                     */
/*  A 4-digit code is a 10,000-value keyspace — no hash makes that      */
/*  expensive to brute force once exposed. The hash never leaves the    */
/*  server (it lives in `vault_passcodes/{orgId}`, an admin-only        */
/*  collection no client rule ever grants read on), so what matters      */
/*  here is a fixed-time comparison, not hash cost. `scrypt` is used     */
/*  anyway rather than a bare digest, purely because it is already the   */
/*  Node built-in this project reaches for (see `reset-throttle.ts`)     */
/*  and a salted KDF costs nothing extra to use correctly.               */
/* ------------------------------------------------------------------ */

const KEY_LENGTH = 32;

export interface PasscodeHash {
  hash: string;
  salt: string;
}

/** Exactly four digits — nothing shorter, nothing alphanumeric. */
export function isValidPasscodeFormat(code: unknown): code is string {
  return typeof code === "string" && /^\d{4}$/.test(code);
}

export function hashPasscode(code: string): PasscodeHash {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(code, salt, KEY_LENGTH).toString("hex");
  return { hash, salt };
}

/**
 * Compares in fixed time so a wrong guess cannot be timed for information,
 * however little a 4-digit space has to leak.
 */
export function verifyPasscode(code: string, hash: string, salt: string): boolean {
  try {
    const candidate = scryptSync(code, salt, KEY_LENGTH);
    const stored = Buffer.from(hash, "hex");
    if (candidate.length !== stored.length) return false;
    return timingSafeEqual(candidate, stored);
  } catch {
    return false;
  }
}

/** Same fixed-time contract, for the emailed reset token rather than the code. */
export function safeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
