"use server";

import { createHash, randomBytes } from "crypto";
import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { requireCaller, requireOwner } from "@/lib/auth/caller";
import { logActivity } from "@/lib/telemetry";
import {
  hashPasscode,
  isValidPasscodeFormat,
  safeEqualHex,
  verifyPasscode,
} from "@/lib/vault/passcode";
import {
  claimPasscodeAttempt,
  claimPasscodeResetRequest,
  clearPasscodeAttempts,
} from "@/lib/vault/passcode-throttle";
import { sendVaultPasscodeResetEmail } from "@/lib/email/sendVaultPasscodeResetEmail";
import { getAppUrl } from "@/lib/utils/getAppUrl";

/* ------------------------------------------------------------------ */
/*  Vault passcode                                                     */
/*                                                                     */
/*  A second gate in front of the whole shelf, on top of the org        */
/*  membership and per-document clearance `actions/vault.ts` already     */
/*  checks. Set by the OWNER and handed to the team by word of mouth —    */
/*  never emailed, never shown anywhere in the app once saved.            */
/*                                                                       */
/*  A correct entry does not unlock anything by itself: it writes         */
/*  `organizations/{orgId}/vaultUnlocks/{uid}` with a short expiry,        */
/*  which is the document both Firestore rules and `requireVaultUnlock`    */
/*  in `lib/auth/caller.ts` check before granting anything. That is what   */
/*  makes this a real gate rather than a screen the UI shows once.         */
/* ------------------------------------------------------------------ */

const UNLOCK_DURATION_MS = 30 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

type ActionResult<T = object> =
  | ({ success: true } & T)
  | { success: false; error: string };

function passcodeDoc(orgId: string) {
  return adminDb.collection("vault_passcodes").doc(orgId);
}

function unlockDoc(orgId: string, uid: string) {
  return adminDb
    .collection("organizations")
    .doc(orgId)
    .collection("vaultUnlocks")
    .doc(uid);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/* ------------------------------------------------------------------ */
/*  Status                                                             */
/* ------------------------------------------------------------------ */

/**
 * Whether this workspace has a Vault passcode configured yet.
 *
 * Any member may ask — the answer never touches the code itself, only
 * whether one exists, which the gate needs to decide between "enter it"
 * and "ask your owner to set one up".
 */
export async function getVaultPasscodeStatusAction(): Promise<
  ActionResult<{ configured: boolean }>
> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const snap = await passcodeDoc(caller.orgId).get();
    return { success: true, configured: Boolean(snap.data()?.passcodeHash) };
  } catch (err) {
    console.error("[VaultPasscode] Failed to read status:", err);
    return { success: false, error: "Could not check the Vault passcode." };
  }
}

/* ------------------------------------------------------------------ */
/*  Set / change                                                       */
/* ------------------------------------------------------------------ */

export async function setVaultPasscodeAction(code: string): Promise<ActionResult> {
  try {
    const caller = await requireOwner();
    if (!caller.ok) return { success: false, error: caller.error };

    if (!isValidPasscodeFormat(code)) {
      return { success: false, error: "Passcode must be exactly 4 digits." };
    }

    const existed = Boolean((await passcodeDoc(caller.orgId).get()).data()?.passcodeHash);
    const { hash, salt } = hashPasscode(code);

    await passcodeDoc(caller.orgId).set(
      {
        passcodeHash: hash,
        salt,
        setBy: caller.uid,
        setAt: new Date(),
        updatedAt: new Date(),
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      },
      { merge: true }
    );

    await logActivity({
      eventType: "VAULT_PASSCODE_SET",
      orgId: caller.orgId,
      actor: { uid: caller.uid, name: caller.name },
      metadata: { changed: existed },
    });

    return { success: true };
  } catch (err) {
    console.error("[VaultPasscode] Failed to set passcode:", err);
    return { success: false, error: "Could not set the Vault passcode." };
  }
}

/* ------------------------------------------------------------------ */
/*  Verify                                                              */
/* ------------------------------------------------------------------ */

interface VerifyResult {
  success: boolean;
  error?: string;
  /** No passcode exists yet — the caller should be offered setup instead of entry. */
  needsSetup?: boolean;
}

export async function verifyVaultPasscodeAction(code: string): Promise<VerifyResult> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };
    const { uid, orgId, role } = caller;

    const snap = await passcodeDoc(orgId).get();
    const data = snap.data();

    if (!data?.passcodeHash || !data?.salt) {
      if (role === "OWNER") {
        return { success: false, error: "No passcode set yet.", needsSetup: true };
      }
      return {
        success: false,
        error: "Ask your workspace owner to set up the Vault passcode.",
      };
    }

    if (!isValidPasscodeFormat(code)) {
      return { success: false, error: "Enter all 4 digits." };
    }

    const verdict = await claimPasscodeAttempt(uid, orgId);
    if (verdict === "locked") {
      return { success: false, error: "Too many attempts. Try again in 15 minutes." };
    }
    if (verdict === "unavailable") {
      return {
        success: false,
        error: "Could not verify the passcode right now. Try again shortly.",
      };
    }

    if (!verifyPasscode(code, data.passcodeHash as string, data.salt as string)) {
      return { success: false, error: "Incorrect passcode." };
    }

    await clearPasscodeAttempts(uid, orgId);
    await unlockDoc(orgId, uid).set({
      unlockedUntil: Timestamp.fromMillis(Date.now() + UNLOCK_DURATION_MS),
    });

    return { success: true };
  } catch (err) {
    console.error("[VaultPasscode] Failed to verify passcode:", err);
    return { success: false, error: "Could not verify the passcode right now." };
  }
}

/* ------------------------------------------------------------------ */
/*  Forgot passcode — OWNER only, always by email                      */
/* ------------------------------------------------------------------ */

export async function requestVaultPasscodeResetAction(): Promise<ActionResult> {
  try {
    const caller = await requireOwner();
    if (!caller.ok) return { success: false, error: caller.error };
    const { orgId, uid } = caller;

    const verdict = await claimPasscodeResetRequest(orgId);
    if (verdict === "locked") {
      return { success: false, error: "Too many reset requests today. Try again tomorrow." };
    }
    if (verdict === "unavailable") {
      return {
        success: false,
        error: "Could not process the request right now. Try again shortly.",
      };
    }

    const userSnap = await adminDb.collection("users").doc(uid).get();
    const email = userSnap.data()?.email as string | undefined;
    if (!email) {
      return { success: false, error: "Your account has no email on file." };
    }

    const token = randomBytes(32).toString("hex");
    await passcodeDoc(orgId).set(
      {
        resetTokenHash: hashToken(token),
        resetTokenExpiresAt: Timestamp.fromMillis(Date.now() + RESET_TOKEN_TTL_MS),
      },
      { merge: true }
    );

    const link = new URL("/vault/reset-passcode", getAppUrl());
    link.searchParams.set("orgId", orgId);
    link.searchParams.set("token", token);

    const sent = await sendVaultPasscodeResetEmail({ email, resetLink: link.toString() });
    if (!sent.success) {
      console.error("[VaultPasscode] Resend rejected the send:", sent.error);
      return { success: false, error: "Could not send the reset email. Try again shortly." };
    }

    return { success: true };
  } catch (err) {
    console.error("[VaultPasscode] Failed to request a reset:", err);
    return { success: false, error: "Could not process the request right now." };
  }
}

export async function resetVaultPasscodeAction(
  orgId: string,
  token: string,
  newCode: string
): Promise<ActionResult> {
  try {
    const caller = await requireOwner();
    if (!caller.ok) return { success: false, error: caller.error };

    // The caller's own org, not the org named in the link — a reset link
    // is only ever valid for the workspace that requested it.
    if (caller.orgId !== orgId) {
      return { success: false, error: "This reset link belongs to a different workspace." };
    }
    if (!isValidPasscodeFormat(newCode)) {
      return { success: false, error: "Passcode must be exactly 4 digits." };
    }

    const snap = await passcodeDoc(orgId).get();
    const data = snap.data();
    if (!data?.resetTokenHash || !data?.resetTokenExpiresAt) {
      return { success: false, error: "This reset link is invalid. Request a new one." };
    }

    const expiresAt = (data.resetTokenExpiresAt as Timestamp).toDate();
    if (expiresAt.getTime() < Date.now()) {
      return { success: false, error: "This reset link has expired. Request a new one." };
    }
    if (!safeEqualHex(hashToken(token), data.resetTokenHash as string)) {
      return { success: false, error: "This reset link is invalid. Request a new one." };
    }

    const { hash, salt } = hashPasscode(newCode);
    await passcodeDoc(orgId).set(
      {
        passcodeHash: hash,
        salt,
        setBy: caller.uid,
        setAt: new Date(),
        updatedAt: new Date(),
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      },
      { merge: true }
    );

    await logActivity({
      eventType: "VAULT_PASSCODE_RESET",
      orgId,
      actor: { uid: caller.uid, name: caller.name },
    });

    return { success: true };
  } catch (err) {
    console.error("[VaultPasscode] Failed to reset passcode:", err);
    return { success: false, error: "Could not reset the Vault passcode." };
  }
}
