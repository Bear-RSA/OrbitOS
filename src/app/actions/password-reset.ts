"use server";

import { headers } from "next/headers";

import { adminAuth } from "@/lib/firebase/admin";
import { claimResetSend } from "@/lib/auth/reset-throttle";
import { sendPasswordResetEmail } from "@/lib/email/sendPasswordResetEmail";
import { getAppUrl } from "@/lib/utils/getAppUrl";
import { passwordResetRequestSchema } from "@/lib/validations/auth";

/* ------------------------------------------------------------------ */
/*  Password reset dispatch                                            */
/*                                                                     */
/*  Firebase mints the credential; Resend carries it.                  */
/*                                                                     */
/*  `generatePasswordResetLink` hands back a link addressed to the      */
/*  project's configured action handler, which on this project cannot   */
/*  be changed — the console and the Identity Toolkit API both refuse   */
/*  with EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED. So the `oobCode` is lifted  */
/*  out and re-pointed at our own /reset-password page. The code is     */
/*  redeemed against Firebase by whichever page holds it; Firebase does */
/*  not care that the page is not the one named in its config.          */
/*                                                                     */
/*  Nothing here calls `sendPasswordResetEmail` on the client SDK any   */
/*  more. That path went through Firebase's built-in mailer, which has  */
/*  no delivery log and no bounce reporting — a reset that never lands  */
/*  looks identical to one that was never sent, and that is what left   */
/*  a locked-out user with no way back into their account.              */
/* ------------------------------------------------------------------ */

export type ResetRequestResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Success is reported whether or not an account exists.
 *
 * The reply must not become an oracle for which addresses are registered,
 * so "no such user" and "sent" are the same answer. A send that fails
 * after the account was found is reported the same way for the same
 * reason — it is logged loudly here and lands in `mail_deliveries` via
 * the Resend webhook, which is where an operator should learn about it
 * rather than an anonymous caller.
 */
const UNIFORM_SUCCESS: ResetRequestResult = { ok: true };

/** Vercel puts the client first in `x-forwarded-for`. */
async function callerIp(): Promise<string | null> {
  try {
    const store = await headers();
    const forwarded = store.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
    return store.get("x-real-ip");
  } catch {
    return null;
  }
}

/**
 * Rewrites Firebase's link to point at our own handler.
 *
 * Returns null if the link arrives without an `oobCode`, which would mean
 * Firebase changed the shape of what it generates. Sending a reset mail
 * whose link cannot reset anything is worse than sending none.
 */
function repointToOurHandler(firebaseLink: string): string | null {
  try {
    const oobCode = new URL(firebaseLink).searchParams.get("oobCode");
    if (!oobCode) return null;

    const target = new URL("/reset-password", getAppUrl());
    target.searchParams.set("mode", "resetPassword");
    target.searchParams.set("oobCode", oobCode);
    return target.toString();
  } catch {
    return null;
  }
}

function errorCode(err: unknown): string {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : "";
}

export async function requestPasswordResetAction(
  rawEmail: string
): Promise<ResetRequestResult> {
  const parsed = passwordResetRequestSchema.safeParse({ email: rawEmail });
  // A malformed address cannot belong to an account, so it takes the same
  // answer as one that does not — no branch an attacker could measure.
  if (!parsed.success) return UNIFORM_SUCCESS;

  const email = parsed.data.email.trim().toLowerCase();

  const verdict = await claimResetSend(email, await callerIp());
  if (verdict === "email-limited") {
    return {
      ok: false,
      error: "Too many reset requests for this address. Try again in an hour.",
    };
  }
  if (verdict === "ip-limited") {
    return {
      ok: false,
      error: "Too many reset requests from this connection. Try again in an hour.",
    };
  }
  if (verdict === "unavailable") {
    return {
      ok: false,
      error: "Could not process the request right now. Please try again shortly.",
    };
  }

  let firebaseLink: string;
  try {
    firebaseLink = await adminAuth.generatePasswordResetLink(email);
  } catch (err) {
    const code = errorCode(err);
    if (code === "auth/user-not-found" || code === "auth/invalid-email") {
      return UNIFORM_SUCCESS;
    }
    console.error("[PasswordReset] Could not generate a reset link:", err);
    return {
      ok: false,
      error: "Could not process the request right now. Please try again shortly.",
    };
  }

  const resetLink = repointToOurHandler(firebaseLink);
  if (!resetLink) {
    console.error(
      "[PasswordReset] Generated link carried no oobCode — nothing was sent."
    );
    return {
      ok: false,
      error: "Could not process the request right now. Please try again shortly.",
    };
  }

  const sent = await sendPasswordResetEmail({ email, resetLink });
  if (!sent.success) {
    // Deliberately not surfaced to the caller — see UNIFORM_SUCCESS.
    console.error("[PasswordReset] Resend rejected the send:", sent.error);
  }

  return UNIFORM_SUCCESS;
}
