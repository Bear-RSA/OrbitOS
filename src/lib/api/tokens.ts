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

/** Recognisable in a leaked log or a secret scanner. */
export const TOKEN_PREFIX = "orb_";

/**
 * What a token may do. `write` implies `read` — a token that could
 * create a task but not see one would only ever be a bug.
 */
export type TokenScope = "read" | "write";

export interface StoredToken {
  uid: string;
  orgId: string;
  name: string;
  scopes: TokenScope[];
  /** First characters of the plaintext, so a person can tell tokens apart. */
  hint: string;
  createdAt: FirebaseFirestore.Timestamp;
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
  return list.includes("write") ? ["read", "write"] : ["read"];
}
