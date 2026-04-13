"use server";

import { adminDb } from "@/lib/firebase/admin";
import type { MemberInvite } from "@/types/member";
import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";

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
        role: "member",
      }, { merge: true });
    } else {
      // First-time invited user — create a complete minimal profile
      batch.set(userRef, {
        id: payload.uid,
        email: payload.email.toLowerCase().trim(),
        name: "",
        orgId: invite.orgId,
        role: "member",
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
