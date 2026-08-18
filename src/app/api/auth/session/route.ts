import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from "@/lib/auth/session";

/* ------------------------------------------------------------------ */
/*  Session Cookie Exchange                                            */
/*                                                                     */
/*  Firebase Auth lives client-side, so the server has no way to know  */
/*  who is calling. This route trades a freshly-minted Firebase ID     */
/*  token for an httpOnly session cookie the server can verify on      */
/*  every request.                                                     */
/*                                                                     */
/*  POST   — establish a session (called after sign-in / sign-up)      */
/*  DELETE — tear it down (called on sign-out)                         */
/* ------------------------------------------------------------------ */

// firebase-admin is Node-only; it cannot run on the Edge runtime.
export const runtime = "nodejs";

function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const idToken = body?.idToken;

    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json({ error: "Missing idToken." }, { status: 400 });
    }

    // Verify before minting. `checkRevoked` rejects tokens belonging to
    // users who have been disabled or had their sessions revoked.
    await adminAuth.verifyIdToken(idToken, true);

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set({
      ...sessionCookieOptions(SESSION_MAX_AGE_MS / 1000),
      value: sessionCookie,
    });
    return response;
  } catch (error) {
    console.error("[Session] Failed to establish session:", error);
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({ ...sessionCookieOptions(0), value: "" });
  return response;
}
