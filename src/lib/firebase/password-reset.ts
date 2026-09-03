"use client";

import {
  ActionCodeSettings,
  confirmPasswordReset,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
} from "firebase/auth";

import { getAppUrl } from "@/lib/utils/getAppUrl";
import { auth } from "./client";

/**
 * Where Firebase sends the user after they finish resetting. On a preview
 * deployment `window.location.origin` keeps the link pointing at the same
 * host the request came from; `getAppUrl()` covers the server-render case.
 *
 * NOTE: the domain must be listed under Firebase Authentication →
 * Settings → Authorized domains, or `sendPasswordResetEmail` rejects with
 * `auth/unauthorized-continue-uri`.
 */
function continueUrl(): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : getAppUrl();
  return `${origin}/login`;
}

function actionCodeSettings(): ActionCodeSettings {
  return { url: continueUrl(), handleCodeInApp: false };
}

/**
 * Firebase reports `auth/user-not-found` when the address has no account,
 * which turns this form into an account-existence oracle. Callers get a
 * uniform success instead, so the reply is identical either way.
 *
 * `auth/too-many-requests` is deliberately *not* swallowed — that one is
 * about the sender, not the target, and the user needs to know their email
 * is not coming.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email, actionCodeSettings());
  } catch (err) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code: unknown }).code)
        : "";

    if (code === "auth/user-not-found" || code === "auth/invalid-email") return;
    throw err;
  }
}

/** Resolves to the email the code belongs to, or throws if it is spent. */
export function checkResetCode(oobCode: string): Promise<string> {
  return verifyPasswordResetCode(auth, oobCode);
}

export function completePasswordReset(
  oobCode: string,
  newPassword: string
): Promise<void> {
  return confirmPasswordReset(auth, oobCode, newPassword);
}

/** Firebase codes surface raw otherwise; these are the ones users actually hit. */
export function describeResetError(code: string): string {
  switch (code) {
    case "auth/expired-action-code":
      return "That reset link has expired. Request a new one below.";
    case "auth/invalid-action-code":
      return "That reset link is invalid or has already been used. Request a new one below.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact your workspace owner.";
    case "auth/user-not-found":
      return "This account no longer exists.";
    case "auth/weak-password":
      return "Choose a stronger password — at least 8 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/unauthorized-continue-uri":
      return "This domain is not authorised for password resets. Contact support.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/** Pulls the Firebase error code off an unknown throw. */
export function errorCode(err: unknown): string {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : "";
}
