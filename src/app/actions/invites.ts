"use server";

import { adminDb } from "@/lib/firebase/admin";
import type { MemberInvite } from "@/types/member";
import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { getAppUrl } from "@/lib/utils/getAppUrl";
import { sendInviteEmail } from "@/lib/email/sendInviteEmail";
import { nanoid } from "@/lib/utils/nanoid";
import { logActivity } from "@/lib/telemetry";

/* ------------------------------------------------------------------ */
/*  Create Invite — server action                                     */
/*  Creates the invite doc, builds the join link using env-aware URL,  */
/*  and dispatches the invitation email in a single server round-trip. */
/* ------------------------------------------------------------------ */

interface CreateInvitePayload {
  orgId: string;
  email: string;
  invitedBy: string;
  projectName?: string;
}

interface CreateInviteResult {
  success: boolean;
  reused?: boolean;
  regenerated?: boolean;
  inviteLink?: string;
  email?: string;
  emailSent?: boolean;
  error?: string;
}

export async function createInviteAction(
  payload: CreateInvitePayload
): Promise<CreateInviteResult> {
  try {
    const email = payload.email.toLowerCase().trim();
    const now = new Date();
    const expires = new Date();
    expires.setDate(now.getDate() + 7);

    // Atomic transaction: lookup → reuse/regenerate/create
    const txResult = await adminDb.runTransaction(async (tx) => {
      const freshToken = nanoid(32);
      let token = freshToken;
      let reused = false;
      let regenerated = false;

      const existingSnap = await tx.get(
        adminDb.collection("memberInvites")
          .where("orgId", "==", payload.orgId)
          .where("email", "==", email)
          .where("status", "==", "pending")
          .limit(1)
      );

      if (!existingSnap.empty) {
        reused = true;
        const inviteDoc = existingSnap.docs[0];
        const inviteData = inviteDoc.data() as MemberInvite;

        const isExpired = inviteData.expiresAt && inviteData.expiresAt.toDate() < now;

        if (isExpired) {
          // Expired invite — regenerate token + expiry
          regenerated = true;
          tx.update(inviteDoc.ref, {
            token,
            expiresAt: AdminTimestamp.fromDate(expires),
          });
        } else {
          // Valid pending invite — reuse existing token
          token = inviteData.token;
        }
      } else {
        // No existing invite — create new document
        const newRef = adminDb.collection("memberInvites").doc();
        tx.set(newRef, {
          orgId: payload.orgId,
          email,
          invitedBy: payload.invitedBy,
          role: "MEMBER",
          status: "pending",
          token,
          createdAt: AdminTimestamp.fromDate(now),
          expiresAt: AdminTimestamp.fromDate(expires),
        });
      }

      return { token, reused, regenerated };
    });

    // Build link using env-aware base URL
    const appUrl = getAppUrl();
    const inviteLink = `${appUrl}/join?token=${txResult.token}`;

    const inviterSnap = await adminDb.collection("users").doc(payload.invitedBy).get();
    const inviterName = inviterSnap.exists ? inviterSnap.data()!.name || "Operator" : "System";

    // Dispatch email — await result to surface success/failure
    const emailResult = await sendInviteEmail({
      email,
      inviteLink,
      projectName: payload.projectName ?? "OrbitOS",
      inviterName,
    });

    const emailSent = emailResult.success;

    if (!emailSent) {
      console.error("[INVITE_EMAIL_FAILED]", { email, projectId: payload.orgId, error: emailResult.error });
    }

    // Log activity (non-blocking)
    await logActivity({
      eventType: "INVITE_DISPATCHED",
      orgId: payload.orgId,
      projectId: null,
      actor: { uid: payload.invitedBy, name: inviterName },
      metadata: { email, emailSent, reused: txResult.reused, regenerated: txResult.regenerated },
    });

    return {
      success: true,
      reused: txResult.reused,
      regenerated: txResult.regenerated,
      inviteLink,
      email,
      emailSent,
      error: emailSent ? undefined : emailResult.error,
    };
  } catch (error: any) {
    console.error("[Create Invite Error]:", error);
    return { success: false, error: "Failed to generate integration link." };
  }
}

export async function getInviteInfoAction(token: string) {
  try {
    const invitesRef = adminDb.collection("memberInvites");
    // Query by token field as specified
    const snapshot = await invitesRef.where("token", "==", token).limit(1).get();

    if (snapshot.empty) {
      return null;
    }

    const inviteDoc = snapshot.docs[0];
    const data = inviteDoc.data() as MemberInvite;
    
    const isExpired = data.expiresAt && data.expiresAt.toDate() < new Date();

    return {
      id: inviteDoc.id,
      token: data.token,
      email: data.email,
      orgId: data.orgId,
      status: data.status,
      invitedBy: data.invitedBy,
      role: data.role,
      createdAt: data.createdAt?.toDate().toISOString(),
      expiresAt: data.expiresAt?.toDate().toISOString(),
      isExpired: !!isExpired
    };
  } catch (error) {
    console.error("[Get Invite Info Error]:", error);
    return null;
  }
}

interface RedeemPayload {
  token: string;
  uid: string;
  email: string;
}

export async function redeemInviteAction(payload: RedeemPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const invitesRef = adminDb.collection("memberInvites");
    // Ensure consistent query logic
    const snapshot = await invitesRef.where("token", "==", payload.token).limit(1).get();

    if (snapshot.empty) {
      return { success: false, error: "This link is invalid or authorization has expired." };
    }

    const inviteDoc = snapshot.docs[0];
    const invite = inviteDoc.data() as MemberInvite;

    // 1. Status Verification
    if (invite.status !== "pending") {
      return { success: false, error: "This integration link has already been verified or expired." };
    }

    // 2. Expiration Verification
    if (invite.expiresAt && invite.expiresAt.toDate() < new Date()) {
      return { success: false, error: "This integration link has expired. Request a new invite." };
    }

    // 3. Identity Match Verification
    if (invite.email !== payload.email.toLowerCase().trim()) {
      return { success: false, error: "Identity mismatch. You cannot consume this invite with the incorrect account." };
    }

    // 4. Atomic Batch Update
    const batch = adminDb.batch();

    // Create or update user document
    const userRef = adminDb.collection("users").doc(payload.uid);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      // Existing user — only attach org membership
      batch.set(userRef, {
        orgId: invite.orgId,
        role: "MEMBER",
      }, { merge: true });
    } else {
      // First-time invited user — create a complete minimal profile
      batch.set(userRef, {
        id: payload.uid,
        email: payload.email.toLowerCase().trim(),
        name: "",
        orgId: invite.orgId,
        role: "MEMBER",
        createdAt: AdminTimestamp.now(),
      });
    }

    // Mark Invite Consumed
    batch.update(inviteDoc.ref, {
      status: "accepted",
      acceptedBy: payload.uid,
      acceptedAt: AdminTimestamp.now(),
    });

    await batch.commit();

    return { success: true };
  } catch (error: any) {
    console.error("[Invite Redemption Error]:", error);
    return { success: false, error: "System encountered an error during redemption. Please try again." };
  }
}
