"use server";

import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireServerUid } from "@/lib/auth/session";
import { pushTokenId } from "@/lib/notifications/push-sender";
import { pushTokenSchema } from "@/lib/validations/notifications";

/* ------------------------------------------------------------------ */
/*  Notification Server Actions                                        */
/*                                                                     */
/*  Registering a device to be rung. Two writes, both trivial, and     */
/*  both here rather than in the browser for one reason: a push token  */
/*  is the authority to interrupt somebody. A client that could write  */
/*  the `uid` beside a token could point its own device at a           */
/*  colleague's notifications, or point a colleague's device at its    */
/*  own — so `firestore.rules` refuses every client write to           */
/*  `pushTokens`, and the uid here comes from the session cookie,      */
/*  never from the payload.                                            */
/*                                                                     */
/*  Same no-uid-argument contract as `actions/calls` and               */
/*  `actions/messages`, for the same reason.                           */
/* ------------------------------------------------------------------ */

const PUSH_TOKENS = "pushTokens";

export type ActionOutcome = { success: true } | { success: false; error: string };

/**
 * Registers this device, or refreshes a registration it already has.
 *
 * Keyed by the hash of the token, so re-enabling on a device that was
 * already registered updates one row instead of accumulating one per
 * visit — a browser hands back the same token every time until it is
 * explicitly deleted.
 *
 * `orgId` rides along so a workspace's registrations can be cleaned up
 * together later; nothing reads it yet, and it costs one field to have
 * rather than a migration to add.
 */
export async function registerPushTokenAction(input: unknown): Promise<ActionOutcome> {
  try {
    const parsed = pushTokenSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "That device could not be registered." };
    }
    const { token } = parsed.data;

    let uid: string;
    try {
      uid = await requireServerUid();
    } catch {
      return { success: false, error: "Your session has expired. Sign in again." };
    }

    const snap = await adminDb.collection("users").doc(uid).get();
    if (!snap.exists) return { success: false, error: "User not found." };

    await adminDb
      .collection(PUSH_TOKENS)
      .doc(pushTokenId(token))
      .set({
        uid,
        orgId: (snap.data()?.orgId as string) ?? "",
        token,
        createdAt: AdminTimestamp.now(),
      });

    return { success: true };
  } catch (err) {
    console.error("[NotificationAction] Could not register push token:", err);
    return { success: false, error: "Could not register this device." };
  }
}

/**
 * Forgets a device.
 *
 * The owner check is not ceremony. Token ids are derived by hashing,
 * so anybody holding a colleague's token could compute the row it lives
 * in — and without this, turning your own notifications off would be
 * one substituted string away from turning off theirs.
 */
export async function unregisterPushTokenAction(input: unknown): Promise<ActionOutcome> {
  try {
    const parsed = pushTokenSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid device." };

    let uid: string;
    try {
      uid = await requireServerUid();
    } catch {
      return { success: false, error: "Your session has expired. Sign in again." };
    }

    const ref = adminDb.collection(PUSH_TOKENS).doc(pushTokenId(parsed.data.token));
    const snap = await ref.get();

    // Already gone is already off.
    if (!snap.exists) return { success: true };
    if (snap.data()?.uid !== uid) return { success: false, error: "Unauthorized." };

    await ref.delete();
    return { success: true };
  } catch (err) {
    console.error("[NotificationAction] Could not unregister push token:", err);
    return { success: false, error: "Could not turn notifications off for this device." };
  }
}
