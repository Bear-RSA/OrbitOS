"use server";

import { adminDb } from "@/lib/firebase/admin";
import type { MemberInvite } from "@/types/member";
import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { getAppUrl } from "@/lib/utils/getAppUrl";
import { sendInviteEmail } from "@/lib/email/sendInviteEmail";
import { nanoid } from "@/lib/utils/nanoid";
import { logActivity } from "@/lib/telemetry";
import { validateTierQuota } from "@/lib/auth/permissions";
import { loadInternalManagementIds, requireAdminTools } from "@/lib/internal-management/store";
import { ADMIN_LOCKED_ERROR } from "@/lib/internal-management/rules";
import { getServerSession } from "@/lib/auth/session";
import { sendPush } from "@/lib/notifications/push-sender";

/* ------------------------------------------------------------------ */
/*  Create Invite — server action                                     */
/*  Creates the invite doc, builds the join link using env-aware URL,  */
/*  and dispatches the invitation email in a single server round-trip. */
/* ------------------------------------------------------------------ */

/** How long an invite link works. The email and Admin Tools both quote it. */
const INVITE_LIFETIME_DAYS = 7;

const INVITES = "memberInvites";

const NOT_INTERNAL_MANAGEMENT = "Only Internal Management can invite people to the workspace.";

/**
 * Invites come only from Admin Tools: Internal Management, with the
 * passcode unlock still running. A locked caller gets the locked error
 * back unchanged, so the Admin Tools screen knows to ask again.
 */
async function requireInviter() {
  const caller = await requireAdminTools();
  if (caller.ok) return caller;
  return { ok: false as const, error: caller.error === ADMIN_LOCKED_ERROR ? ADMIN_LOCKED_ERROR : NOT_INTERNAL_MANAGEMENT };
}

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

    /* Only Internal Management, from inside Admin Tools, brings anyone
       into the workspace. The rule is checked here, where it can be
       trusted, not by which buttons a page shows.

       Both the inviter and the workspace used to arrive in the payload,
       and the two checks below validated them against each other rather
       than against the caller — so naming another workspace's owner and
       that workspace's id satisfied both, and sent an invitation into
       someone else's org off their seat allowance. */
    const caller = await requireInviter();
    if (!caller.ok) return { success: false, error: caller.error };
    const invitedBy = caller.uid;
    const orgId = caller.orgId;

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
    if (invite.status === "revoked") {
      return { success: false, error: "This invite was withdrawn. Ask whoever invited you for a new one." };
    }
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

    if (currentOrgId !== invite.orgId) await announceArrival(invite.orgId, uid);

    return { success: true };
  } catch (error: any) {
    console.error("[Invite Redemption Error]:", error);
    return { success: false, error: "Couldn't accept the invite. Try again." };
  }
}

/**
 * Tells the workspace someone new arrived: one feed event, and a push to
 * everyone in Internal Management, who sent the invite. Never throws; the
 * person is already in, and none of this is a reason to undo that.
 */
async function announceArrival(orgId: string, uid: string): Promise<void> {
  try {
    const userSnap = await adminDb.collection("users").doc(uid).get();
    const name: string = userSnap.data()?.name?.trim() || userSnap.data()?.email || "Someone new";

    await logActivity({
      eventType: "MEMBER_JOINED",
      orgId,
      projectId: null,
      actor: { uid, name },
      metadata: {},
    });

    const recipients = (await loadInternalManagementIds(orgId)).filter((id) => id !== uid);
    await sendPush(
      recipients,
      {
        title: `${name} joined the workspace`,
        body: "Their invite was accepted. They're on Teams now.",
        tag: `orbit-joined-${uid}`,
        url: "/teams",
      },
      { ttlSeconds: 24 * 60 * 60 }
    );
  } catch (err) {
    console.error("[RedeemInvite] Could not announce the arrival:", err);
  }
}

/* ------------------------------------------------------------------ */
/*  Pending invites, for Admin Tools                                   */
/* ------------------------------------------------------------------ */

export interface PendingInvite {
  id: string;
  email: string;
  inviterName: string;
  /** ISO time the link stops working. */
  expiresAt: string;
  expired: boolean;
  inviteLink: string;
}

type InviteResult<T = object> = ({ success: true } & T) | { success: false; error: string };

export async function listPendingInvitesAction(): Promise<InviteResult<{ invites: PendingInvite[] }>> {
  const caller = await requireInviter();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const snap = await adminDb
      .collection(INVITES)
      .where("orgId", "==", caller.orgId)
      .where("status", "==", "pending")
      .get();

    const inviterIds = [...new Set(snap.docs.map((d) => (d.data() as MemberInvite).invitedBy).filter(Boolean))];
    const inviterSnaps = await Promise.all(inviterIds.map((id) => adminDb.collection("users").doc(id).get()));
    const inviterNames = new Map(inviterSnaps.map((u) => [u.id, (u.data()?.name as string)?.trim() || "A teammate"]));

    const now = Date.now();
    const invites = snap.docs
      .map((doc) => {
        const data = doc.data() as MemberInvite;
        const expiresAt = data.expiresAt?.toDate() ?? new Date(0);
        return {
          id: doc.id,
          email: data.email,
          inviterName: inviterNames.get(data.invitedBy) ?? "A teammate",
          expiresAt: expiresAt.toISOString(),
          expired: expiresAt.getTime() < now,
          inviteLink: joinLink(data.token),
        };
      })
      // Soonest to lapse first: those are the ones worth a nudge.
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

    return { success: true, invites };
  } catch (err) {
    console.error("[ListInvites] Could not load pending invites:", err);
    return { success: false, error: "Couldn't load pending invites. Try again." };
  }
}

/** A pending invite in the caller's own workspace, or the reason it isn't one. */
async function loadOwnPendingInvite(orgId: string, inviteId: string) {
  if (typeof inviteId !== "string" || !inviteId) return { ok: false as const, error: "That invite doesn't exist." };
  const ref = adminDb.collection(INVITES).doc(inviteId);
  const snap = await ref.get();
  const data = snap.data() as MemberInvite | undefined;
  if (!data || data.orgId !== orgId) return { ok: false as const, error: "That invite doesn't exist." };
  if (data.status !== "pending") return { ok: false as const, error: "That invite was already used or withdrawn." };
  return { ok: true as const, ref, data };
}

/** Emails the invite again and gives it a fresh seven days. The link stays the same. */
export async function resendInviteAction(input: { inviteId: string }): Promise<InviteResult<{ emailSent: boolean }>> {
  const caller = await requireInviter();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const invite = await loadOwnPendingInvite(caller.orgId, input?.inviteId);
    if (!invite.ok) return { success: false, error: invite.error };

    await invite.ref.update({ expiresAt: AdminTimestamp.fromDate(expiryFrom(new Date())) });

    // Sent in the resender's name: they are the one asking again.
    const { workspaceName, inviterName } = await loadInviteNames(caller.orgId, caller.uid);
    const emailResult = await sendInviteEmail({
      email: invite.data.email,
      inviteLink: joinLink(invite.data.token),
      projectName: workspaceName,
      inviterName,
      expiresInDays: INVITE_LIFETIME_DAYS,
    });
    if (!emailResult.success) {
      console.error("[INVITE_EMAIL_FAILED]", { inviteId: input.inviteId, error: emailResult.error });
    }

    return { success: true, emailSent: emailResult.success };
  } catch (err) {
    console.error("[ResendInvite] Failed:", err);
    return { success: false, error: "Couldn't resend the invite. Try again." };
  }
}

/** Withdraws an invite. The link stops working at once. */
export async function revokeInviteAction(input: { inviteId: string }): Promise<InviteResult> {
  const caller = await requireInviter();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const invite = await loadOwnPendingInvite(caller.orgId, input?.inviteId);
    if (!invite.ok) return { success: false, error: invite.error };

    await invite.ref.update({
      status: "revoked",
      revokedBy: caller.uid,
      revokedAt: AdminTimestamp.now(),
    });
    return { success: true };
  } catch (err) {
    console.error("[RevokeInvite] Failed:", err);
    return { success: false, error: "Couldn't withdraw the invite. Try again." };
  }
}
