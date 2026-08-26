import { createHmac, timingSafeEqual } from "crypto";
import { getAppUrl } from "@/lib/utils/getAppUrl";

/* ------------------------------------------------------------------ */
/*  RSVP tokens                                                        */
/*                                                                     */
/*  A guest has no account, so there is nothing to sign in to and no   */
/*  session to check. The link in their invite email is the whole      */
/*  credential — the same bargain the calendar feed makes, with one    */
/*  difference that matters: this link WRITES.                         */
/*                                                                     */
/*  So it is deliberately narrower than a feed token. It names a       */
/*  single subject AND a single engagement, which bounds a leak to one */
/*  meeting's RSVP rather than to a person's whole schedule.           */
/*  Forwarding invite mail is normal behaviour, and this is what keeps */
/*  that from handing over anything more than the ability to answer    */
/*  one question.                                                      */
/*                                                                     */
/*  Members carry the same kind of link. They could answer in the app, */
/*  but an invite that shows Yes/Maybe/No to outsiders and a bare      */
/*  "open OrbitOS" to staff is a worse product for no reason, and one  */
/*  RSVP page is less to keep correct than two.                        */
/*                                                                     */
/*  Format: kind.base64url(subjectId).base64url(eventId).version.hmac  */
/* ------------------------------------------------------------------ */

export type RsvpSubjectKind = "member" | "guest";

export interface RsvpIdentity {
  kind: RsvpSubjectKind;
  /** A uid when `kind` is member, a guest id when it is guest. */
  subjectId: string;
  eventId: string;
  /**
   * The revocation counter for this subject: `calendarFeedVersion` on a
   * user, `tokenVersion` on a guest. Verified against the stored value by
   * the caller — this only proves we issued the token.
   */
  version: number;
}

/**
 * Shares CALENDAR_FEED_SECRET rather than adding a second secret to
 * deploy. Safe because the two token formats have different arities and
 * different HMAC domain prefixes, so neither can be replayed as the
 * other even if the raw bytes were rearranged.
 */
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
  return createHmac("sha256", secret()).update(`rsvp:${payload}`).digest("base64url");
}

const KIND_CHAR: Record<RsvpSubjectKind, string> = { member: "m", guest: "g" };
const KIND_FROM_CHAR: Record<string, RsvpSubjectKind> = { m: "member", g: "guest" };

const b64 = (v: string) => Buffer.from(v, "utf8").toString("base64url");

export function signRsvpToken(
  kind: RsvpSubjectKind,
  subjectId: string,
  eventId: string,
  version: number
): string {
  const payload = `${KIND_CHAR[kind]}.${b64(subjectId)}.${b64(eventId)}.${version}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Returns what the token claims, or null if the signature does not hold.
 * A non-null result still has to be checked against the stored version
 * for that subject — this proves we issued it, not that it is still live.
 */
export function verifyRsvpToken(token: string): RsvpIdentity | null {
  const parts = token.split(".");
  if (parts.length !== 5) return null;

  const [kindChar, encodedSubject, encodedEvent, rawVersion, signature] = parts;

  const kind = KIND_FROM_CHAR[kindChar];
  if (!kind) return null;

  const expected = sign(`${kindChar}.${encodedSubject}.${encodedEvent}.${rawVersion}`);

  const given = Buffer.from(signature, "utf8");
  const want = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on a length mismatch, so screen for that first.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  const subjectId = Buffer.from(encodedSubject, "base64url").toString("utf8");
  const eventId = Buffer.from(encodedEvent, "base64url").toString("utf8");
  const version = Number(rawVersion);
  if (!subjectId || !eventId || !Number.isInteger(version) || version < 0) return null;

  return { kind, subjectId, eventId, version };
}

/** The absolute URL a recipient clicks to answer. */
export function rsvpUrlFor(
  kind: RsvpSubjectKind,
  subjectId: string,
  eventId: string,
  version: number
): string {
  const base = getAppUrl().replace(/\/$/, "");
  return `${base}/rsvp/${signRsvpToken(kind, subjectId, eventId, version)}`;
}
