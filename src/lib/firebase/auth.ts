"use client";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import { auth } from "./client";

const SESSION_ENDPOINT = "/api/auth/session";

/**
 * Give up rather than hang — a stalled exchange must not strand the UI.
 *
 * Generous on purpose: the first call after a cold start pays for
 * firebase-admin initialisation and was measured at ~14s locally (warm calls
 * settle around 40ms). A tighter bound aborts the very first sign-in of a
 * session, which looks identical to bad credentials.
 */
const SESSION_SYNC_TIMEOUT_MS = 30_000;

/**
 * Signing in mints the cookie twice over: once from `signIn`/`signUp`
 * directly, and once from the `onAuthChange` listener those calls trigger.
 * Both would force-refresh the ID token and race a `createSessionCookie`
 * round trip against each other. Collapsing concurrent calls for the same
 * uid onto one in-flight request keeps that to a single exchange.
 */
let inFlight: { uid: string; promise: Promise<void> } | null = null;

async function exchangeIdTokenForCookie(user: FirebaseUser): Promise<void> {
  const idToken = await user.getIdToken(/* forceRefresh */ true);

  // `AbortSignal.timeout` isn't available everywhere this ships, so drive
  // the controller manually.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SESSION_SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(SESSION_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("Could not establish a secure session. Please try again.");
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Session setup timed out. Check your connection and try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Exchanges the user's Firebase ID token for an httpOnly session cookie so
 * the server can identify the caller. Throws if the exchange fails — without
 * the cookie, middleware will bounce the user straight back to /login.
 */
export function syncSession(user: FirebaseUser): Promise<void> {
  if (inFlight && inFlight.uid === user.uid) return inFlight.promise;

  const promise = exchangeIdTokenForCookie(user).finally(() => {
    // Only clear if we are still the current entry; a newer sync for a
    // different uid must not be wiped out by this one settling late.
    if (inFlight?.promise === promise) inFlight = null;
  });

  inFlight = { uid: user.uid, promise };
  return promise;
}

async function clearSession(): Promise<void> {
  try {
    await fetch(SESSION_ENDPOINT, { method: "DELETE" });
  } catch (err) {
    // Best effort — the client-side sign-out below still proceeds.
    console.error("[Auth] Failed to clear server session:", err);
  }
}

export async function signUp(email: string, password: string) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await syncSession(credential.user);
  return credential;
}

export async function signIn(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  await syncSession(credential.user);
  return credential;
}

export async function signOut() {
  await clearSession();
  return firebaseSignOut(auth);
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
