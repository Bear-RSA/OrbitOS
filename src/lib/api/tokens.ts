import { createHash, randomBytes } from "crypto";

/* ------------------------------------------------------------------ */
/*  Personal access tokens                                             */
/*                                                                     */
/*  What lets a program act as a person: their own AI assistant, a     */
/*  script, anything that cannot hold a session cookie. A token is a   */
/*  credential with that person's whole reach inside their workspace,  */
/*  so only its SHA-256 lives in Firestore — the plaintext is shown    */
/*  once, at creation, and never again. A leaked database is then a    */
/*  list of hashes, not a list of keys.                                */
/*                                                                     */
/*  The hash is the document id in `api_tokens`, which makes the       */
/*  lookup on every request one read with no index and no scan.        */
/* ------------------------------------------------------------------ */

export const TOKEN_COLLECTION = "api_tokens";
export const THROTTLE_COLLECTION = "api_token_throttle";
export const AUDIT_COLLECTION = "api_audit";

/** Recognisable in a leaked log or a secret scanner. */
export const TOKEN_PREFIX = "orb_";

/**
 * What a token may do. `write` implies `read` — a token that could
 * create a task but not see one would only ever be a bug.
 *
 * `guests` is the one that leaves the building: it lets the token put
 * people from outside the workspace on a meeting, which mails them from
 * our domain. An assistant talked into something by text in a task
 * description is exactly the caller that should not have that by
 * default, so it is a separate tick, off unless asked for, and only on
 * top of `write`.
 */
export type TokenScope = "read" | "write" | "guests";

/** Lifetimes a person can pick. There is no "never": a key nobody remembers is the one that leaks. */
export const TOKEN_LIFETIMES_DAYS = [30, 90, 365] as const;
export const DEFAULT_TOKEN_LIFETIME_DAYS = 90;

export interface StoredToken {
  uid: string;
  orgId: string;
  name: string;
  scopes: TokenScope[];
  /** First characters of the plaintext, so a person can tell tokens apart. */
  hint: string;
  createdAt: FirebaseFirestore.Timestamp;
  /** After this the token is refused. Absent only on tokens made before expiry existed. */
  expiresAt?: FirebaseFirestore.Timestamp | null;
  lastUsedAt: FirebaseFirestore.Timestamp | null;
  revokedAt: FirebaseFirestore.Timestamp | null;
}

/** A fresh token: 32 random bytes, base64url, behind the prefix. */
export function generateToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** What the settings list shows in place of the token. */
export function hintFor(token: string): string {
  return `${token.slice(0, TOKEN_PREFIX.length + 6)}…`;
}

/**
 * The token from an `Authorization: Bearer …` header, or null. Rejects
 * anything that is not shaped like one of ours before it costs a read.
 */
export function readBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token.slice(TOKEN_PREFIX.length))) return null;
  return token;
}

/** Normalises requested scopes. Anything unrecognised is dropped. */
export function normaliseScopes(input: unknown): TokenScope[] {
  const list = Array.isArray(input) ? input : [];
  if (!list.includes("write")) return ["read"];
  return list.includes("guests") ? ["read", "write", "guests"] : ["read", "write"];
}

/** A requested lifetime, snapped to one we offer. */
export function normaliseLifetime(days: unknown): number {
  return (TOKEN_LIFETIMES_DAYS as readonly number[]).includes(days as number)
    ? (days as number)
    : DEFAULT_TOKEN_LIFETIME_DAYS;
}

/** Whether a stored token has passed its expiry. */
export function isExpired(token: Pick<StoredToken, "expiresAt">, nowMs: number): boolean {
  return Boolean(token.expiresAt && token.expiresAt.toMillis() <= nowMs);
}

/**
 * Document id for an audit entry: the uid, then the time counted
 * backwards. Listing a person's entries is then a document-id range
 * read that comes back newest first, with no composite index to deploy.
 */
export function auditEntryId(uid: string, nowMs: number): string {
  const inverted = String(9_999_999_999_999 - nowMs).padStart(13, "0");
  return `${uid}_${inverted}_${Math.random().toString(36).slice(2, 8)}`;
}
