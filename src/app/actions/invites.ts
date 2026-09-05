"use server";

import { adminDb } from "@/lib/firebase/admin";
import type { MemberInvite } from "@/types/member";
import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { getAppUrl } from "@/lib/utils/getAppUrl";
import { sendInviteEmail } from "@/lib/email/sendInviteEmail";
import { nanoid } from "@/lib/utils/nanoid";
import { logActivity } from "@/lib/telemetry";
import { validateOwner, validateTierQuota } from "@/lib/auth/permissions";
import { getServerSession } from "@/lib/auth/session";

/* ------------------------------------------------------------------ */
/*  Create Invite — server action                                     */
/*  Creates the invite doc, builds the join link using env-aware URL,  */
/*  and dispatches the invitation email in a single server round-trip. */
/* ------------------------------------------------------------------ */

interface CreateInvitePayload {
  email: string;
  projectName?: string;
  /** @deprecated Ignored — the workspace comes from the caller's session. */
  orgId?: string;
  /** @deprecated Ignored — the inviter's identity comes from the session. */
  invitedBy?: string;
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

    /* Only the owner adds seats. This used to lean on the invite dialog
       being mounted for owners alone; the roster grid is now visible to
       members too, so the rule is checked where it can be trusted.

       Both the inviter and the workspace used to arrive in the payload,
       and the two checks below validated them against each other rather
       than against the caller — so naming another workspace's owner and
       that workspace's id satisfied both, and sent an invitation into
       someone else's org off their seat allowance. */
    const session = await getServerSession();
    if (!session) {
      return { success: false, error: "Your session has expired. Sign in again." };
    }
    const invitedBy = session.uid;

    const authStatus = await validateOwner(invitedBy);
    if (!authStatus.isOwner) {
      return { success: false, error: authStatus.error ?? "Unauthorized. Requires OWNER clearance." };
    }
    const orgId = authStatus.orgId!;

    // Enforce tier seat limit before proceeding
    const quota = await validateTierQuota(orgId, "members");
    if (!quota.allowed) {
      console.warn("[CreateInvite] Seat limit reached:", { orgId, ...quota });
      return { success: false, error: quota.error || "Member seat limit reached." };
    }

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
          .where("orgId", "==", orgId)
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
          orgId,
          email,
          invitedBy,
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

    const inviterSnap = await adminDb.collection("users").doc(invitedBy).get();
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
      console.error("[INVITE_EMAIL_FAILED]", { email, projectId: orgId, error: emailResult.error });
    }

    // Log activity (non-blocking)
    await logActivity({
      eventType: "INVITE_DISPATCHED",
      orgId,
      projectId: null,
      actor: { uid: invitedBy, name: inviterName },
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
  /** @deprecated Ignored — the redeemer's identity comes from the session. */
  uid?: string;
  /** @deprecated Ignored — the verified address comes from the session. */
  email?: string;
}

/**
 * Consumes an invite and attaches the caller to the workspace.
 *
 * Both the account to attach and the address to match used to come from
 * the payload. That made the identity check circular — a holder of the
 * token supplied both sides of it — so anyone with a link could join a
 * workspace under any address, or attach an account that was not theirs.
 * The session is the only thing that can answer either question.
 *
 * Sign-in and sign-up both mint the session cookie before returning, so
 * by the time the join screen can call this the caller has one.
 */
export async function redeemInviteAction(payload: RedeemPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession();
    if (!session) {
      return { success: false, error: "Your session has expired. Sign in again." };
    }

    const uid = session.uid;
    const email = (session.email ?? "").toLowerCase().trim();
    if (!email) {
      return { success: false, error: "This account has no verified email address." };
    }

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
    if (invite.email !== email) {
      return { success: false, error: "Identity mismatch. You cannot consume this invite with the incorrect account." };
    }

    // 4. Atomic Batch Update
    const batch = adminDb.batch();

    // Create or update user document
    const userRef = adminDb.collection("users").doc(uid);
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
        id: uid,
        email,
        name: "",
        orgId: invite.orgId,
        role: "MEMBER",
        createdAt: AdminTimestamp.now(),
      });
    }

    // Mark Invite Consumed
    batch.update(inviteDoc.ref, {
      status: "accepted",
      acceptedBy: uid,
      acceptedAt: AdminTimestamp.now(),
    });

    await batch.commit();

    return { success: true };
  } catch (error: any) {
    console.error("[Invite Redemption Error]:", error);
    return { success: false, error: "System encountered an error during redemption. Please try again." };
  }
}
