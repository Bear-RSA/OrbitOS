"use server";

import { createHash } from "crypto";
import { FieldValue, Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireServerUid } from "@/lib/auth/session";
import { resolveCallLimits } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/telemetry";
import { sendCallPush } from "@/lib/notifications/push-sender";
import { getCallProvider } from "@/lib/calls/provider";
import { participantName } from "@/lib/calls/display-name";
import { newRoomId } from "@/lib/calls/room-id";
import {
  canAnswerCall,
  canJoinGroupCall,
  canStartGroupCall,
  canStartDirectCall,
  groupCallLive,
} from "@/lib/calls/access";
import {
  GROUP_CALL_MINUTES,
  HARD_MAX_CONCURRENT_DIRECT_CALLS,
  HARD_MAX_CONCURRENT_GROUP_CALLS,
  RING_TIMEOUT_SECONDS,
  capParticipants,
  capRoomExpiry,
  capTokenSeconds,
  groupCallSeats,
} from "@/lib/calls/ceiling";
import { groupCallSchema, startCallSchema } from "@/lib/validations/call";
import type { CallGrant } from "@/types/call";

/* ------------------------------------------------------------------ */
/*  Call Server Actions                                                */
/*                                                                     */
/*  Every provider token in the product is minted here, on the Admin   */
/*  SDK, behind an explicit org check — the same bargain `events.ts`   */
/*  makes for writes. The API key never leaves the server and a token  */
/*  is never built in a browser.                                       */
/*                                                                     */
/*  ONE DELIBERATE DIFFERENCE from `events.ts`: these actions take no  */
/*  `uid` argument. They resolve the caller from the verified session  */
/*  cookie instead, as `lib/auth/session` recommends. A uid passed in  */
/*  from the browser is an unverified claim, and here the thing it     */
/*  buys is a live credential to somebody else's meeting — pass a      */
/*  colleague's uid, get a token to the room they are sitting in. That */
/*  is a different class of mistake from writing a row you are allowed */
/*  to write anyway, so this path does not accept the claim at all.    */
/* ------------------------------------------------------------------ */

const CALLS = "calls";
const CONVERSATIONS = "conversations";

export type GrantResult =
  | { success: true; grant: CallGrant }
  | { success: false; error: string };

export type CallActionResult =
  | { success: true; callId: string }
  | { success: false; error: string };

export type ActionOutcome = { success: true } | { success: false; error: string };

/** Same shape as the guards in `events.ts`, with an explicit discriminant. */
type Caller =
  | { ok: true; uid: string; orgId: string; name: string; role: string }
  | { ok: false; error: string };

/**
 * Resolves the caller from the session cookie and guarantees they belong
 * to an organization.
 */
async function requireCaller(): Promise<Caller> {
  let uid: string;
  try {
    uid = await requireServerUid();
  } catch {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }

  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) return { ok: false, error: "User not found." };

  const data = snap.data()!;
  if (!data.orgId) return { ok: false, error: "Unauthorized." };

  return {
    ok: true,
    uid,
    orgId: data.orgId as string,
    name: (data.name as string) || "Operative",
    role: (data.role as string) || "MEMBER",
  };
}

/* ------------------------------------------------------------------ */
/*  Grants                                                             */
/* ------------------------------------------------------------------ */

interface GrantRequest {
  roomId: string;
  identity: string;
  displayName: string;
  /** Members get room-management rights; guests and walk-ins never do. */
  isMember: boolean;
  minutes: number;
  /**
   * Seats in the room. Clamped again by `capParticipants` below, so a
   * caller that gets this wrong cannot widen the ceiling.
   *
   * Defaults to a pair, which is what a direct call is. A group call
   * passes the number `groupCallSeats` worked out from the thread and
   * the plan — the room is created on first join and every joiner after
   * that finds it, so a room built for two would turn the third person
   * away from a call they belong in.
   */
  maxParticipants?: number;
}

/**
 * Mints one room pass.
 *
 * The single place a token is created, so the ceiling clamps and the
 * guest marking cannot be skipped by a new join path forgetting them.
 * It decides nothing about permission — every caller has already run the
 * relevant gate in `lib/calls/access`.
 */
async function grantFor(request: GrantRequest): Promise<CallGrant> {
  const provider = await getCallProvider();

  /* Idempotent by contract: the room may already exist, and for every
     joiner after the first it does. */
  const room = await provider.createRoom({
    name: request.roomId,
    expiresAt: capRoomExpiry(new Date(Date.now() + request.minutes * 60_000)),
    maxParticipants: capParticipants(request.maxParticipants ?? 2),
  });

  const displayName = participantName(request.displayName, !request.isMember);
  const ttlSeconds = capTokenSeconds(request.minutes * 60);

  const token = await provider.mintAccessToken({
    room: room.roomName,
    identity: request.identity,
    displayName,
    canPublish: true,
    ttlSeconds,
    isOwner: request.isMember,
  });

  return {
    provider: provider.id,
    roomUrl: room.roomUrl,
    token,
    displayName,
    expiresAt: Date.now() + ttlSeconds * 1000,
  };
}

/* ------------------------------------------------------------------ */
/*  Direct calls                                                       */
/*                                                                     */
/*  One member rings another. No scheduling, no invitation, no RSVP —  */
/*  the `calls` document IS the call, and it exists for as long as the */
/*  question "are you there?" is unanswered.                           */
/* ------------------------------------------------------------------ */

const DIRECT_CALL_MINUTES = 120;

/** Rings a teammate. Returns the call id the caller's UI subscribes to. */
export async function startCallAction(input: unknown): Promise<CallActionResult> {
  try {
    const parsed = startCallSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid call." };
    }
    const { targetUid } = parsed.data;

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const targetSnap = await adminDb.collection("users").doc(targetUid).get();
    if (!targetSnap.exists) {
      return { success: false, error: "That operative was not found." };
    }
    const target = targetSnap.data()!;

    const [limits, activeSnap] = await Promise.all([
      resolveCallLimits(caller.orgId),
      /* Equality-only, so no composite index. Counts the workspace's live
         direct calls for the concurrency ceiling. */
      adminDb
        .collection(CALLS)
        .where("orgId", "==", caller.orgId)
        .where("status", "==", "active")
        .get(),
    ]);

    const decision = canStartDirectCall({
      callerOrgId: caller.orgId,
      targetOrgId: (target.orgId as string) ?? "",
      callerUid: caller.uid,
      targetUid,
      maxParticipants: limits.maxParticipants,
      activeDirectCalls: activeSnap.size,
      hardMaxConcurrent: HARD_MAX_CONCURRENT_DIRECT_CALLS,
    });
    if (!decision.allowed) return { success: false, error: decision.message };

    /* The room is materialized before the callee is told anything. If the
       provider is down the caller finds out now, rather than the callee
       answering a ring into a room that does not exist. */
    const provider = await getCallProvider();
    const roomId = newRoomId();
    await provider.createRoom({
      name: roomId,
      expiresAt: capRoomExpiry(new Date(Date.now() + DIRECT_CALL_MINUTES * 60_000)),
      maxParticipants: capParticipants(2),
    });

    const now = AdminTimestamp.now();
    const ref = await adminDb.collection(CALLS).add({
      orgId: caller.orgId,
      roomId,
      from: caller.uid,
      to: targetUid,
      fromName: caller.name,
      toName: (target.name as string) || "Operative",
      status: "ringing",
      ringingExpiresAt: AdminTimestamp.fromDate(
        new Date(Date.now() + RING_TIMEOUT_SECONDS * 1000)
      ),
      createdAt: now,
      answeredAt: null,
      endedAt: null,
      endedBy: null,
    });

    await logActivity({
      eventType: "CALL_STARTED",
      orgId: caller.orgId,
      projectId: null,
      actor: { uid: caller.uid, name: caller.name },
      metadata: {
        callId: ref.id,
        to: targetUid,
        toName: (target.name as string) || null,
      },
    });

    /* Ring the callee's registered devices, for the case no listener can
       cover: a browser that is closed.

       NOT awaited, and that is the design. The `calls` document is
       already written, so the call is already ringing on every client
       that has OrbitOS open — a push service having a slow morning must
       not hold up the caller's screen behind it. `sendCallPush`
       swallows its own failures for the same reason. */
    void sendCallPush({
      toUid: targetUid,
      fromName: caller.name,
      callId: ref.id,
    });

    return { success: true, callId: ref.id };
  } catch (err: any) {
    console.error("[CallAction] Failed to start call:", err);
    return { success: false, error: err?.message || "Could not place the call." };
  }
}

/**
 * Loads a call and confirms the caller is one of its two ends.
 *
 * Org membership is not enough here. A call is between two named people,
 * and a third member of the same workspace has no more business in it
 * than a stranger does.
 */
async function requireCallParticipant(callId: string, uid: string, orgId: string) {
  const ref = adminDb.collection(CALLS).doc(callId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false as const, error: "That call no longer exists." };

  const data = snap.data()!;
  if (data.orgId !== orgId) return { ok: false as const, error: "Unauthorized." };
  if (data.from !== uid && data.to !== uid) {
    return { ok: false as const, error: "Unauthorized." };
  }
  return { ok: true as const, ref, data };
}

/** Picks up. Flips the call to active and hands back a room grant. */
export async function answerCallAction(callId: string): Promise<GrantResult> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const found = await requireCallParticipant(callId, caller.uid, caller.orgId);
    if (!found.ok) return { success: false, error: found.error };

    const expiresAt =
      (found.data.ringingExpiresAt as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0;

    const decision = canAnswerCall(found.data.status, expiresAt);
    if (!decision.allowed) return { success: false, error: decision.message };

    if (found.data.status === "ringing") {
      await found.ref.update({ status: "active", answeredAt: AdminTimestamp.now() });
    }

    const grant = await grantFor({
      roomId: found.data.roomId as string,
      identity: caller.uid,
      displayName: caller.name,
      isMember: true,
      minutes: DIRECT_CALL_MINUTES,
    });

    return { success: true, grant };
  } catch (err: any) {
    console.error("[CallAction] Failed to answer call:", err);
    return { success: false, error: err?.message || "Could not join the call." };
  }
}

/**
 * The caller's own way into the room they placed.
 *
 * Separate from `answerCallAction` because the caller must not flip
 * their own call to `active` — that state means "somebody picked up",
 * and a caller sitting alone in a room has answered nothing.
 */
export async function getDirectCallGrantAction(callId: string): Promise<GrantResult> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const found = await requireCallParticipant(callId, caller.uid, caller.orgId);
    if (!found.ok) return { success: false, error: found.error };

    if (["ended", "declined", "missed"].includes(found.data.status)) {
      return { success: false, error: "This call has ended." };
    }

    const grant = await grantFor({
      roomId: found.data.roomId as string,
      identity: caller.uid,
      displayName: caller.name,
      isMember: true,
      minutes: DIRECT_CALL_MINUTES,
    });

    return { success: true, grant };
  } catch (err: any) {
    console.error("[CallAction] Failed to grant call access:", err);
    return { success: false, error: err?.message || "Could not join the call." };
  }
}

async function closeCall(
  callId: string,
  status: "declined" | "ended" | "missed"
): Promise<ActionOutcome> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const found = await requireCallParticipant(callId, caller.uid, caller.orgId);
    if (!found.ok) return { success: false, error: found.error };

    // Idempotent: hanging up twice is still hung up.
    if (["ended", "declined", "missed"].includes(found.data.status)) {
      return { success: true };
    }

    await found.ref.update({
      status,
      endedAt: AdminTimestamp.now(),
      // A ring that timed out was ended by nobody, and says so.
      endedBy: status === "missed" ? null : caller.uid,
    });

    return { success: true };
  } catch (err: any) {
    console.error("[CallAction] Failed to close call:", err);
    return { success: false, error: "Could not update the call." };
  }
}

/** Declines. Distinct from missing it — this is an answer. */
export async function declineCallAction(callId: string): Promise<ActionOutcome> {
  return closeCall(callId, "declined");
}

/** Hangs up, or cancels a ring the caller no longer wants to place. */
export async function endCallAction(callId: string): Promise<ActionOutcome> {
  return closeCall(callId, "ended");
}

/**
 * Marks a ring nobody reached in time.
 *
 * Called by the caller's own client when the timer runs out. It is a
 * tidy-up, not a gate: `canAnswerCall` already refuses an expired ring,
 * so a client that never fires this leaves a stale row and nothing more.
 */
export async function markCallMissedAction(callId: string): Promise<ActionOutcome> {
  return closeCall(callId, "missed");
}

/* ------------------------------------------------------------------ */
/*  Group calls                                                        */
/*                                                                     */
/*  A room beside a conversation. Nothing rings: one person opens the  */
/*  room and everyone in the thread sees it is open and can walk in.   */
/*                                                                     */
/*  That is a deliberate refusal of the obvious design, which is to    */
/*  fan a ring out to every member of the group. One click would then  */
/*  place eight calls, eight phones would ring across the studio for a */
/*  conversation two people needed, and the way to make that stop      */
/*  would be to turn call sounds off — after which the direct calls    */
/*  that DO need to interrupt somebody stop landing too. A group call  */
/*  is a door held open, not a summons.                                */
/*                                                                     */
/*  The state lives on the conversation rather than in `calls`. See    */
/*  the note on `ConversationCall` in `types/message` for why: the     */
/*  thread already knows who may join, and the left rail is already    */
/*  listening to it.                                                   */
/* ------------------------------------------------------------------ */

/** The conversation, once its workspace has been confirmed. */
async function requireConversation(conversationId: string, orgId: string) {
  const ref = adminDb.collection(CONVERSATIONS).doc(conversationId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: false as const, error: "That conversation no longer exists." };
  }

  const data = snap.data()!;
  /* Read off the document rather than taken from the client, the same
     boundary `forwardTaskAction` enforces before it will quote a task. */
  if ((data.orgId as string) !== orgId) {
    return { ok: false as const, error: "Unauthorized." };
  }

  return { ok: true as const, ref, data };
}

/**
 * How many group calls this workspace has live right now.
 *
 * Equality-only, so no composite index — which is the whole reason
 * `callActive` exists beside `activeCall`. Expiry is applied here in
 * memory rather than in the query: a room whose deadline has passed is
 * over whether or not anybody wrote that down, and filtering on it in
 * Firestore would mean an inequality and a second index.
 */
async function liveGroupCallCount(orgId: string, now: number): Promise<number> {
  const snap = await adminDb
    .collection(CONVERSATIONS)
    .where("orgId", "==", orgId)
    .where("callActive", "==", true)
    .get();

  return snap.docs.filter((doc) => groupCallLive(doc.data().activeCall, now)).length;
}

/**
 * Opens a room beside a group thread, or walks into the one already
 * open, and hands back a pass either way.
 *
 * ONE action for both, and the transaction is why. Two people clicking
 * Start in the same second both read a thread with no call; without a
 * transaction both would write one, and the studio would end up with
 * two rooms holding one person each and no way to tell which was the
 * meeting. Claiming the room inside a transaction makes the loser find
 * the winner's room and join that, which is what the two of them meant.
 *
 * The room itself is not materialized here. `grantFor` creates it, is
 * idempotent by contract, and runs for every joiner — so the room comes
 * into existence with its first pass rather than with this write, and a
 * call nobody ever entered costs the provider nothing.
 */
export async function startGroupCallAction(input: unknown): Promise<GrantResult> {
  try {
    const parsed = groupCallSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid conversation.",
      };
    }
    const { conversationId } = parsed.data;

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const found = await requireConversation(conversationId, caller.orgId);
    if (!found.ok) return { success: false, error: found.error };

    const now = Date.now();
    const participantIds = (found.data.participantIds as string[]) ?? [];

    /* Counted outside the transaction on purpose. Pulling the query in
       would lock every conversation in the workspace to enforce a
       ceiling that is a cost backstop rather than a correctness rule —
       two calls starting in the same instant may briefly make six, and
       six rooms is not the failure this number exists to prevent. */
    const [limits, activeGroupCalls] = await Promise.all([
      resolveCallLimits(caller.orgId),
      liveGroupCallCount(caller.orgId, now),
    ]);

    const shared = {
      conversationType: (found.data.type as string) ?? "",
      conversationOrgId: (found.data.orgId as string) ?? "",
      participantIds,
      viewerUid: caller.uid,
      viewerOrgId: caller.orgId,
      maxParticipants: limits.maxParticipants,
    };

    const seats = groupCallSeats(participantIds.length, limits.maxParticipants);

    /* Resolved inside the transaction: which room this person is about
       to enter, or why they may not. */
    let roomId: string | null = null;
    let refusal: string | null = null;

    await adminDb.runTransaction(async (tx) => {
      const fresh = await tx.get(found.ref);
      const call = fresh.data()?.activeCall;

      if (groupCallLive(call, now)) {
        const occupants = Object.keys(call.participants ?? {}).length;
        const decision = canJoinGroupCall({
          ...shared,
          live: true,
          occupants,
          seats,
          alreadyIn: Boolean(call.participants?.[caller.uid]),
        });
        if (!decision.allowed) {
          refusal = decision.message;
          return;
        }

        roomId = call.roomId as string;
        /* A dotted write, so joining touches one key and cannot clobber
           the account of who else is in the room. */
        tx.update(found.ref, {
          [`activeCall.participants.${caller.uid}`]: caller.name,
        });
        return;
      }

      const decision = canStartGroupCall({
        ...shared,
        activeGroupCalls,
        hardMaxConcurrent: HARD_MAX_CONCURRENT_GROUP_CALLS,
      });
      if (!decision.allowed) {
        refusal = decision.message;
        return;
      }

      roomId = newRoomId();
      tx.update(found.ref, {
        activeCall: {
          roomId,
          startedBy: caller.uid,
          startedByName: caller.name,
          startedAt: AdminTimestamp.now(),
          participants: { [caller.uid]: caller.name },
          /* The same deadline the room is created with, written down so
             every client can see when this call is over without asking
             the provider. */
          expiresAt: AdminTimestamp.fromDate(
            capRoomExpiry(new Date(now + GROUP_CALL_MINUTES * 60_000), new Date(now))
          ),
        },
        callActive: true,
      });
    });

    if (refusal) return { success: false, error: refusal };
    if (!roomId) return { success: false, error: "Could not open that call." };

    const grant = await grantFor({
      roomId,
      identity: caller.uid,
      displayName: caller.name,
      isMember: true,
      minutes: GROUP_CALL_MINUTES,
      maxParticipants: seats,
    });

    await logActivity({
      eventType: "CALL_STARTED",
      orgId: caller.orgId,
      projectId: null,
      actor: { uid: caller.uid, name: caller.name },
      metadata: {
        conversationId,
        groupName: (found.data.name as string) ?? null,
        participants: participantIds.length,
      },
    });

    return { success: true, grant };
  } catch (err: any) {
    console.error("[CallAction] Failed to start group call:", err);
    return { success: false, error: err?.message || "Could not open that call." };
  }
}

/**
 * Leaves the room.
 *
 * Best effort, and the design says so out loud. A browser closed
 * mid-call never reaches here, so the participant map can hold a name
 * whose owner has gone — which is why nothing that decides permission
 * rests on it, and why `expiresAt` rather than an empty map is what
 * finally ends a call.
 *
 * The last person out does close it when they leave properly, and that
 * is the common case. A rail badge still lit two hours after everyone
 * hung up is a badge people stop believing.
 */
export async function leaveGroupCallAction(input: unknown): Promise<ActionOutcome> {
  try {
    const parsed = groupCallSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid conversation." };

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const found = await requireConversation(parsed.data.conversationId, caller.orgId);
    if (!found.ok) return { success: false, error: found.error };

    await adminDb.runTransaction(async (tx) => {
      const fresh = await tx.get(found.ref);
      const call = fresh.data()?.activeCall;
      if (!call) return;

      const remaining = Object.keys(call.participants ?? {}).filter(
        (uid) => uid !== caller.uid
      );

      if (remaining.length === 0) {
        // Both fields together, always — see `Conversation.callActive`.
        tx.update(found.ref, { activeCall: null, callActive: false });
        return;
      }

      tx.update(found.ref, {
        [`activeCall.participants.${caller.uid}`]: FieldValue.delete(),
      });
    });

    return { success: true };
  } catch (err: any) {
    console.error("[CallAction] Failed to leave group call:", err);
    return { success: false, error: "Could not leave the call." };
  }
}

/* ------------------------------------------------------------------ */
/*  Proof room — TEMPORARY                                             */
/*                                                                     */
/*  Step one of the build: two people, one room, media flowing, before */
/*  any of the scheduling or ringing UI exists to confuse a failure.   */
/*                                                                     */
/*  DELETE THIS, and `/call/proof`, once the real paths are proven. It */
/*  is org-scoped and session-gated, so it is not a hole — but it is a */
/*  room with no purpose, and those accumulate.                        */
/* ------------------------------------------------------------------ */

/**
 * One stable room per workspace, derived rather than stored.
 *
 * Hashed so it carries the same shape as a real room id and reveals
 * nothing about the org it belongs to, and salted with a constant so it
 * can never collide with an id from `newRoomId`.
 */
function proofRoomIdFor(orgId: string): string {
  const digest = createHash("sha256").update(`orbit-proof-room:${orgId}`).digest("hex");
  return `r_${digest.slice(0, 24)}`;
}

export async function getProofCallGrantAction(
  rawDisplayName: string
): Promise<GrantResult> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    /* The typed name is a convenience for testing from two windows on one
       account — without it both tiles read the same and there is no way
       to tell which is which. */
    const grant = await grantFor({
      roomId: proofRoomIdFor(caller.orgId),
      identity: `${caller.uid}:${Math.random().toString(36).slice(2, 8)}`,
      displayName: rawDisplayName || caller.name,
      isMember: true,
      minutes: 60,
      maxParticipants: 4,
    });

    return { success: true, grant };
  } catch (err: any) {
    console.error("[CallAction] Proof grant failed:", err);
    return { success: false, error: err?.message || "Could not start the call." };
  }
}
