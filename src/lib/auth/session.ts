import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from "./session-cookie";

/* ------------------------------------------------------------------ */
/*  Server-Side Session Resolution                                     */
/*                                                                     */
/*  This is the authoritative answer to "who is making this request?"  */
/*  It runs on the Node runtime only (firebase-admin), so it is usable */
/*  from server actions, route handlers, and server components — but   */
/*  NOT from middleware, which runs on Edge.                           */
/* ------------------------------------------------------------------ */

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS };

export interface ServerSession {
  uid: string;
  email?: string;
}

/**
 * Resolves and cryptographically verifies the caller's session cookie.
 * Returns null when there is no valid session — never throws.
 */
export async function getServerSession(): Promise<ServerSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) return null;

    // `checkRevoked` costs an extra lookup but ensures a revoked or
    // disabled account cannot keep operating on a still-valid cookie.
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    // Expired, malformed, or revoked — all mean "not signed in".
    return null;
  }
}

/**
 * Returns the verified caller's uid, or throws.
 *
 * Prefer this over accepting a `uid` argument from the client. A uid passed
 * in from the browser is an unverified claim: any signed-in user can send
 * someone else's uid and impersonate them.
 */
export async function requireServerUid(): Promise<string> {
  const session = await getServerSession();
  if (!session) {
    throw new Error("Unauthorized: no valid session.");
  }
  return session.uid;
}
