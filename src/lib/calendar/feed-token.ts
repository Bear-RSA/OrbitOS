import { createHmac, timingSafeEqual } from "crypto";
import { getAppUrl } from "@/lib/utils/getAppUrl";

/* ------------------------------------------------------------------ */
/*  Calendar feed tokens                                               */
/*                                                                     */
/*  A calendar client cannot sign in — it fetches a URL on a timer     */
/*  with no headers we control. The URL itself is therefore the        */
/*  credential, which makes two properties non-negotiable: it must be  */
/*  unguessable, and it must be revocable.                             */
/*                                                                     */
/*  The token is `base64url(uid).version.hmac`. Carrying the uid means */
/*  verification is a single document read rather than a collection    */
/*  query, and carrying the version means revocation is one increment  */
/*  on the user document — every previously issued URL stops matching  */
/*  at once, with nothing to clean up.                                 */
/*                                                                     */
/*  This grants read access to one person's schedule, so treat a leak  */
/*  as you would a leaked API key: rotate, do not patch.               */
/* ------------------------------------------------------------------ */

export interface FeedIdentity {
  uid: string;
  version: number;
}

function secret(): string {
  const value = process.env.CALENDAR_FEED_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "CALENDAR_FEED_SECRET is missing or too short — set a random 32+ character value."
    );
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Builds the opaque token that stands in for a signed-in session. */
export function signFeedToken(uid: string, version: number): string {
  const payload = `${Buffer.from(uid, "utf8").toString("base64url")}.${version}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Returns the identity a token claims, or null if the signature does not
 * hold. A non-null result still has to be checked against the version
 * stored on the user document — this only proves the token was issued by
 * us, not that it is still current.
 */
export function verifyFeedToken(token: string): FeedIdentity | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedUid, rawVersion, signature] = parts;
  const expected = sign(`${encodedUid}.${rawVersion}`);

  const given = Buffer.from(signature, "utf8");
  const want = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on a length mismatch, so screen for that first.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  const uid = Buffer.from(encodedUid, "base64url").toString("utf8");
  const version = Number(rawVersion);
  if (!uid || !Number.isInteger(version) || version < 0) return null;

  return { uid, version };
}

/** The absolute URL a person pastes into Google, Outlook, or Apple. */
export function feedUrlFor(uid: string, version: number): string {
  const base = getAppUrl().replace(/\/$/, "");
  return `${base}/api/calendar/${signFeedToken(uid, version)}.ics`;
}
