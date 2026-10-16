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

/** How long an invite link works. The email and the invite dialog both quote it. */
const INVITE_LIFETIME_DAYS = 7;

function expiryFrom(now: Date): Date {
  const expires = new Date(now);
  expires.setDate(now.getDate() + INVITE_LIFETIME_DAYS);
  return expires;
}

function joinLink(token: string): string {
  return `${getAppUrl()}/join?token=${token}`;
}

/**
 * The two names an invitee needs to trust a link: who sent it and which
 * workspace it opens. Read on the server so a caller can't supply either.
 */
async function loadInviteNames(orgId: string, invitedBy: string) {
  const [orgSnap, inviterSnap] = await Promise.all([
    adminDb.collection("organizations").doc(orgId).get(),
    adminDb.collection("users").doc(invitedBy).get(),
  ]);
  const workspaceName: string = orgSnap.data()?.name?.trim() || "their workspace";
  const inviterName: string = inviterSnap.data()?.name?.trim() || "A teammate";
  return { workspaceName, inviterName };
}

interface CreateInvitePayload {
  email: string;
  /** @deprecated Ignored — the workspace name is read from the org. */
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
      return { success: false, error: authStatus.error ?? "Only the workspace owner can do this." };
    }
    const orgId = authStatus.orgId!;

    // Enforce tier seat limit before proceeding
    const quota = await validateTierQuota(orgId, "members");
    if (!quota.allowed) {
      console.warn("[CreateInvite] Seat limit reached:", { orgId, ...quota });
      return { success: false, error: quota.error || "Member seat limit reached." };
    }

    const now = new Date();
    const expires = expiryFrom(now);

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
    const inviteLink = joinLink(txResult.token);

    const { workspaceName, inviterName } = await loadInviteNames(orgId, invitedBy);

    // Dispatch email — await result to surface success/failure
    const emailResult = await sendInviteEmail({
      email,
      inviteLink,
      projectName: workspaceName,
      inviterName,
      expiresInDays: INVITE_LIFETIME_DAYS,
    });

    const emailSent = emailResult.success;

    if (!emailSent) {
      console.error("[INVITE_EMAIL_FAILED]", { email, projectId: orgId, error: emailResult.error });
    }

    // Log activity (non-blocking). No address in the metadata: every member
    // of the workspace can read the activity feed, and an email is the
    // invitee's to share, not the inviter's.
    await logActivity({
      eventType: "INVITE_DISPATCHED",
      orgId,
      projectId: null,
      actor: { uid: invitedBy, name: inviterName },
      metadata: { emailSent, reused: txResult.reused, regenerated: txResult.regenerated },
    });

    return {
      success: true,
      reused: txResult.reused,
      regenerated: txResult.regenerated,
      inviteLink,
      email,
      // No `error` when the email fails: the provider's own message
      // ("Missing API key") means nothing to an owner. It is logged above,
      // and the dialog already says what to do instead.
      emailSent,
    };
  } catch (error: any) {
    console.error("[Create Invite Error]:", error);
    return { success: false, error: "Couldn't create the invite. Try again." };
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
    const { workspaceName, inviterName } = await loadInviteNames(data.orgId, data.invitedBy);

    return {
      id: inviteDoc.id,
      token: data.token,
      email: data.email,
      orgId: data.orgId,
      status: data.status,
      workspaceName,
      inviterName,
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
      return { success: false, error: "Your account has no email address. Sign in with the email the invite was sent to." };
    }

    const invitesRef = adminDb.collection("memberInvites");
    // Ensure consistent query logic
    const snapshot = await invitesRef.where("token", "==", payload.token).limit(1).get();

    if (snapshot.empty) {
      return { success: false, error: "We couldn't find this invite. Check that you opened the whole link from the email, or ask for a new invite." };
    }

    const inviteDoc = snapshot.docs[0];
    const invite = inviteDoc.data() as MemberInvite;

    // 1. Status Verification
    if (invite.status !== "pending") {
      return { success: false, error: "This invite has already been used. If you accepted it, sign in to open your workspace." };
    }

    // 2. Expiration Verification
    if (invite.expiresAt && invite.expiresAt.toDate() < new Date()) {
      return { success: false, error: "This invite has expired. Ask whoever invited you to send a new one." };
    }

    // 3. Identity Match Verification
    if (invite.email !== email) {
      return { success: false, error: "This invite was sent to a different email. Sign in with that email to accept it." };
    }

    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const currentOrgId: string = userSnap.data()?.orgId ?? "";

    // 4. One workspace per account. Accepting used to overwrite `orgId`
    //    and `role` for anyone, so the owner of another workspace who
    //    opened a link was demoted to MEMBER here and left their own
    //    workspace with no owner. The join screen hid the button, but
    //    nothing stopped the call.
    if (currentOrgId && currentOrgId !== invite.orgId) {
      return {
        success: false,
        error:
          userSnap.data()?.role === "OWNER"
            ? "You own another workspace, so this account can't join a second one."
            : "You're already in another workspace. Ask its owner to remove you, then open this link again.",
      };
    }

    // 5. Seat limit, checked again here. The check at invite time counts
    //    only people who have already joined, so an owner could send ten
    //    invites from a two-seat plan and every one of them would land.
    //    Someone already in this workspace takes no new seat.
    if (currentOrgId !== invite.orgId) {
      const quota = await validateTierQuota(invite.orgId, "members");
      if (!quota.allowed) {
        console.warn("[RedeemInvite] Seat limit reached:", { orgId: invite.orgId, ...quota });
        return {
          success: false,
          error: "This workspace has no free seats on its plan. Ask the owner to upgrade, then open the link again.",
        };
      }
    }

    // 6. Atomic Batch Update
    const batch = adminDb.batch();

    if (currentOrgId === invite.orgId) {
      // Already in this workspace (the owner's own address, or a second
      // link to a member). Consume the invite; leave the role alone.
    } else if (userSnap.exists) {
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
    return { success: false, error: "Couldn't accept the invite. Try again." };
  }
}
