"use client";

import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";

import { auth } from "./client";

/* ------------------------------------------------------------------ */
/*  Reset code redemption                                              */
/*                                                                     */
/*  Sending lives server-side in `actions/password-reset` — the link is */
/*  minted with the Admin SDK and carried by Resend, because Firebase's */
/*  built-in mailer reports nothing about whether a message arrived.    */
/*  What remains here is the half that must run in the browser: taking  */
/*  the code out of the URL the recipient opened and redeeming it.      */
/* ------------------------------------------------------------------ */

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
