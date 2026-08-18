"use server";

import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { getServerSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

/* ------------------------------------------------------------------ */
/*  Account Security Actions                                           */
/*                                                                     */
/*  The caller is always resolved from the verified session cookie —   */
/*  never from a uid passed in by the browser.                         */
/* ------------------------------------------------------------------ */

/**
 * Revokes every refresh token issued to the caller and clears this
 * browser's session cookie.
 *
 * Other devices are not signed out instantly: they keep working until
 * their current ID token expires (up to an hour), after which the refresh
 * fails. Server-side the effect is immediate — `verifySessionCookie` runs
 * with `checkRevoked`, so every gated request is rejected right away.
 */
export async function revokeAllSessionsAction(): Promise<
  { success: true } | { success: false; error: string }
> {
  const session = await getServerSession();
  if (!session) {
    return { success: false, error: "No active session." };
  }

  try {
    await adminAuth.revokeRefreshTokens(session.uid);

    const cookieStore = await cookies();
    cookieStore.set({
      name: SESSION_COOKIE_NAME,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return { success: true };
  } catch (error) {
    console.error("[Security] Session revocation failed:", error);
    return { success: false, error: "Could not sign out other sessions." };
  }
}
