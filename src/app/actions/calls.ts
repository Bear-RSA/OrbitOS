"use server";

import { createHash, randomBytes } from "crypto";
import { FieldValue, Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireServerUid } from "@/lib/auth/session";
import { resolveCallLimits } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/telemetry";
import { sendCallPush } from "@/lib/notifications/push-sender";
import { getCallProvider } from "@/lib/calls/provider";
import { grantFor } from "@/lib/calls/grant";
import { newRoomId } from "@/lib/calls/room-id";
import {
  canAddToCall,
  canAnswerCall,
  canJoinGroupCall,
  canJoinScheduledCall,
  canStartGroupCall,
  canStartDirectCall,
  canWalkIn,
  groupCallLive,
  type ScheduledCallFacts,
} from "@/lib/calls/access";
import {
  GROUP_CALL_MINUTES,
  HARD_MAX_CONCURRENT_DIRECT_CALLS,
  HARD_MAX_CONCURRENT_GROUP_CALLS,
  RING_TIMEOUT_SECONDS,
  capRoomExpiry,
  groupCallSeats,
} from "@/lib/calls/ceiling";
import {
  callParticipantNames,
  callParticipants,
  directCallSeats,
  isOnCall,
  othersInCall,
  type PartyShapedCall,
} from "@/lib/calls/party";
import {
  effectiveCallProvider,
  scheduledCallMinutes,
  scheduledCallSeats,
} from "@/lib/calls/scheduled";
import {
  addToCallSchema,
  groupCallSchema,
  roomIdSchema,
  startCallSchema,
  walkInSchema,
} from "@/lib/validations/call";
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
/*  Scheduled calls                                                    */
/*                                                                     */
/*  An engagement that owns a room. The room id travels — it is the    */
/*  link in the invitation — so every entry point takes it from a URL  */
/*  and looks the engagement up by it, never the other way round: the  */
/*  engagement id is in RSVP links and the activity log, and knowing   */
/*  one must not be a way to compute the other.                        */
/*                                                                     */
/*  Two doors. A MEMBER comes through the calendar or the link with a  */
/*  session, and is let in if they are on the list and the window is   */
/*  open. A WALK-IN holds the link and nothing else, and is let in     */
/*  only while a member is already inside — the gate that makes a      */
/*  forwarded link inert outside the meeting itself. The third door,   */
/*  an invited guest arriving off their signed invitation, is in       */
/*  `actions/rsvp` beside the gates that already know what that link   */
/*  proves.                                                            */
/* ------------------------------------------------------------------ */

const EVENTS = "events";

export type ScheduledGrantResult =
  | {
      success: true;
      grant: CallGrant;
      title: string;
      /**
       * The engagement, for the surfaces that go on to act on it — a
       * member ringing a colleague in needs to name the meeting they are
       * adding them to. Withheld from walk-ins: they hold a room id and
       * a name, and an engagement id is not something a forwarded link
       * should buy.
       */
      eventId: string | null;
    }
  | { success: false; error: string };

/**
 * The engagement a room belongs to, or null.
 *
 * An equality query on a single field, so no composite index. Room ids
 * are 96 random bits and issued once, so "the first match" is the only
 * match.
 */
async function findEngagementByRoom(roomId: string) {
  const snap = await adminDb
    .collection(EVENTS)
    .where("roomId", "==", roomId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { ref: doc.ref, id: doc.id, data: doc.data() };
}

/** The facts `lib/calls/access` decides on, read off the document. */
function scheduledFacts(
  event: FirebaseFirestore.DocumentData,
  onTheList: boolean
): ScheduledCallFacts {
  return {
    callProvider: effectiveCallProvider({
      callProvider: event.callProvider,
      meetingUrl: event.meetingUrl,
    }),
    roomId: (event.roomId as string) ?? null,
    cancelled: event.status === "cancelled",
    startAtMs: (event.startAt as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0,
    endAtMs: (event.endAt as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0,
    onTheList,
  };
}

/**
 * A member entering a scheduled call.
 *
 * The first member in opens the room for walk-ins by flagging
 * `callActive`. It is set and never cleared: the join window closing is
 * what ends the call, and `canWalkIn` checks that window itself, so a
 * flag left true after the meeting lets nobody in.
 */
export async function joinScheduledCallAction(input: unknown): Promise<ScheduledGrantResult> {
  try {
    const parsed = roomIdSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid room." };
    }
    const roomId = parsed.data;

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const found = await findEngagementByRoom(roomId);
    if (!found) return { success: false, error: "This link does not point at a call." };
    if (found.data.orgId !== caller.orgId) {
      return { success: false, error: "This engagement is not in your workspace." };
    }

    const attendees = (found.data.attendees as string[]) ?? [];
    const now = Date.now();

    const decision = canJoinScheduledCall(
      scheduledFacts(found.data, attendees.includes(caller.uid)),
      now
    );
    if (!decision.allowed) return { success: false, error: decision.message };

    const limits = await resolveCallLimits(caller.orgId);
    /* Same reading as a direct call: a plan that seats fewer than two
       seats nobody. */
    if (limits.maxParticipants !== -1 && limits.maxParticipants < 2) {
      return { success: false, error: "Your plan does not include calling." };
    }

    /* Flagged before the pass is minted, not after. A provider failure
       on the way in leaves the flag set, and that is the safe direction:
       an open door to a room nobody can enter is nothing, whereas a
       member sitting in a room the flag says is closed keeps the guest
       they invited standing outside. */
    if (!found.data.callActive) {
      await found.ref.update({
        callActive: true,
        callStartedAt: AdminTimestamp.now(),
      });
    }

    const grant = await grantFor({
      roomId,
      identity: caller.uid,
      displayName: caller.name,
      isMember: true,
      minutes: scheduledCallMinutes(
        (found.data.endAt as FirebaseFirestore.Timestamp).toMillis(),
        now
      ),
      maxParticipants: scheduledCallSeats(limits),
    });

    return {
      success: true,
      grant,
      title: (found.data.title as string) || "Engagement",
      eventId: found.id,
    };
  } catch (err: any) {
    console.error("[CallAction] Failed to join scheduled call:", err);
    return { success: false, error: err?.message || "Could not join the call." };
  }
}

/**
 * Someone holding only the link.
 *
 * No session, no invitation, no record kept — the `guests` collection
 * is the client list and a forwarded link is not a client. Their
 * identity is minted per visit and their name rides on the room's
 * participant list, marked, and nowhere else.
 */
export async function walkInToScheduledCallAction(
  input: unknown
): Promise<ScheduledGrantResult> {
  try {
    const parsed = walkInSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
    }
    const { roomId, fullName } = parsed.data;

    const found = await findEngagementByRoom(roomId);
    if (!found) return { success: false, error: "This link does not point at a call." };

    const orgId = (found.data.orgId as string) ?? "";
    const limits = await resolveCallLimits(orgId);
    const now = Date.now();

    const decision = canWalkIn(
      {
        ...scheduledFacts(found.data, false),
        callActive: Boolean(found.data.callActive),
        maxGuests: limits.maxGuests,
      },
      now
    );
    if (!decision.allowed) return { success: false, error: decision.message };

    const grant = await grantFor({
      roomId,
      /* Prefixed so a walk-in can never collide with a uid or a guest
         id, and random so two people typing the same name are still two
         people to the provider. */
      identity: `w_${randomBytes(8).toString("hex")}`,
      displayName: fullName,
      isMember: false,
      minutes: scheduledCallMinutes(
        (found.data.endAt as FirebaseFirestore.Timestamp).toMillis(),
        now
      ),
      maxParticipants: scheduledCallSeats(limits),
    });

    return {
      success: true,
      grant,
      title: (found.data.title as string) || "Engagement",
      eventId: null,
    };
  } catch (err: any) {
    console.error("[CallAction] Walk-in failed:", err);
    return { success: false, error: err?.message || "Could not join the call." };
  }
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
       answering a ring into a room that does not exist.

       Sized to the plan rather than to the pair: a room built for two
       could never take a third person, and `createRoom` is get-or-create,
       so the size it is given here is the size it keeps. Seats nobody
       sits in cost nothing. */
    const provider = await getCallProvider();
    const roomId = newRoomId();
    await provider.createRoom({
      name: roomId,
      expiresAt: capRoomExpiry(new Date(Date.now() + DIRECT_CALL_MINUTES * 60_000)),
      maxParticipants: directCallSeats(limits.maxParticipants),
    });

    const now = AdminTimestamp.now();
    const ref = await adminDb.collection(CALLS).add({
      orgId: caller.orgId,
      roomId,
      from: caller.uid,
      to: targetUid,
      fromName: caller.name,
      toName: (target.name as string) || "Operative",
      /* The caller is in the room from the start; the callee joins the
         list when they answer. See `OrbitCall.participants`. */
      participants: [caller.uid],
      participantNames: { [caller.uid]: caller.name },
      joinsCallId: null,
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
 * Loads a call and confirms the caller is on it — one of its two ends,
 * or somebody rung in since.
 *
 * Org membership is not enough here. A call is between named people,
 * and another member of the same workspace has no more business in it
 * than a stranger does.
 */
async function requireCallParticipant(callId: string, uid: string, orgId: string) {
  const ref = adminDb.collection(CALLS).doc(callId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false as const, error: "That call no longer exists." };

  const data = snap.data()!;
  if (data.orgId !== orgId) return { ok: false as const, error: "Unauthorized." };
  if (!isOnCall(data as PartyShapedCall, uid)) {
    return { ok: false as const, error: "Unauthorized." };
  }
  return { ok: true as const, ref, data };
}

export type AnswerResult =
  | {
      success: true;
      kind: "direct";
      grant: CallGrant;
      /**
       * The call the answerer is now on. Usually the ring they answered;
       * for a ring that added them to a running call, THAT call — the
       * one to hang up from and to transcribe.
       */
      callId: string;
      /** Everyone else in the room, for the bar. */
      withNames: string[];
    }
  | {
      /**
       * The ring added them to a scheduled call. No pass is minted here:
       * they are on the engagement now, and the client opens the room
       * the way the calendar's Join button does, so the scheduled-call
       * surface — not the phone — is what they end up in.
       */
      success: true;
      kind: "scheduled";
      roomId: string;
      title: string;
    }
  | { success: false; error: string };

/**
 * Picks up.
 *
 * Two shapes of ring arrive here. A plain call flips to active and the
 * answerer joins its list. A ring that ADDS them to a running call puts
 * them on that call's list instead and closes the ring — it did its
 * job — so the answerer's pass is to the room that was already open
 * and the document they go on to watch is the call, not the ring.
 */
export async function answerCallAction(callId: string): Promise<AnswerResult> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const found = await requireCallParticipant(callId, caller.uid, caller.orgId);
    if (!found.ok) return { success: false, error: found.error };

    const expiresAt =
      (found.data.ringingExpiresAt as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0;

    const decision = canAnswerCall(found.data.status, expiresAt);
    if (!decision.allowed) return { success: false, error: decision.message };

    const joinsCallId = (found.data.joinsCallId as string | null) ?? null;
    const joinsEventId = (found.data.joinsEventId as string | null) ?? null;

    /* ── Being added to a scheduled call ── */
    if (joinsEventId) {
      const eventRef = adminDb.collection(EVENTS).doc(joinsEventId);
      let refusal: string | null = null;
      let title = "Engagement";
      let roomId: string | null = null;

      /* The answerer becomes an attendee — accepted, since they just
         did — so the calendar shows them on it and every later gate
         reads them as invited. Done in a transaction so two answers in
         the same second cannot clobber each other's addition. */
      await adminDb.runTransaction(async (tx) => {
        const eventSnap = await tx.get(eventRef);
        if (!eventSnap.exists || eventSnap.data()!.status === "cancelled") {
          refusal = "That call has ended.";
          return;
        }
        const event = eventSnap.data()!;
        const facts = scheduledFacts(event, true);
        const window = canJoinScheduledCall(facts);
        if (!window.allowed) {
          refusal = window.message;
          return;
        }

        title = (event.title as string) || "Engagement";
        roomId = facts.roomId;

        const attendees = (event.attendees as string[]) ?? [];
        if (!attendees.includes(caller.uid)) {
          tx.update(eventRef, {
            attendees: [...attendees, caller.uid],
            [`rsvp.${caller.uid}`]: "accepted",
            updatedAt: AdminTimestamp.now(),
          });
        }

        if (found.data.status === "ringing") {
          tx.update(found.ref, {
            status: "ended",
            answeredAt: AdminTimestamp.now(),
            endedAt: AdminTimestamp.now(),
            endedBy: null,
          });
        }
      });

      if (refusal) return { success: false, error: refusal };
      if (!roomId) return { success: false, error: "That call has ended." };

      return { success: true, kind: "scheduled", roomId, title };
    }

    /* ── Being added to a running call ── */
    if (joinsCallId) {
      const parentRef = adminDb.collection(CALLS).doc(joinsCallId);
      const limits = await resolveCallLimits(caller.orgId);
      const seats = directCallSeats(limits.maxParticipants);
      let refusal: string | null = null;
      let withNames: string[] = [];

      /* Inside a transaction: the seat this person was promised when
         they were rung could have been taken by somebody else's ring
         answered a moment earlier, and two answers landing at once must
         not both be told yes. */
      await adminDb.runTransaction(async (tx) => {
        const parentSnap = await tx.get(parentRef);
        if (!parentSnap.exists || parentSnap.data()!.status !== "active") {
          refusal = "That call has ended.";
          return;
        }
        const parent = parentSnap.data()!;
        const party = callParticipants(parent as PartyShapedCall);
        const names = callParticipantNames(parent as PartyShapedCall);

        if (!party.includes(caller.uid)) {
          if (party.length >= seats) {
            refusal = "That call is full.";
            return;
          }
          tx.update(parentRef, {
            participants: [...party, caller.uid],
            [`participantNames.${caller.uid}`]: caller.name,
          });
        }

        withNames = party.filter((id) => id !== caller.uid).map((id) => names[id] || "Operative");

        if (found.data.status === "ringing") {
          tx.update(found.ref, {
            status: "ended",
            answeredAt: AdminTimestamp.now(),
            endedAt: AdminTimestamp.now(),
            endedBy: null,
          });
        }
      });

      if (refusal) return { success: false, error: refusal };

      const grant = await grantFor({
        roomId: found.data.roomId as string,
        identity: caller.uid,
        displayName: caller.name,
        isMember: true,
        minutes: DIRECT_CALL_MINUTES,
      });

      return { success: true, kind: "direct", grant, callId: joinsCallId, withNames };
    }

    /* ── A plain call ── */
    if (found.data.status === "ringing") {
      const party = callParticipants(found.data as PartyShapedCall);
      await found.ref.update({
        status: "active",
        answeredAt: AdminTimestamp.now(),
        participants: party.includes(caller.uid) ? party : [...party, caller.uid],
        [`participantNames.${caller.uid}`]: caller.name,
      });
    }

    const grant = await grantFor({
      roomId: found.data.roomId as string,
      identity: caller.uid,
      displayName: caller.name,
      isMember: true,
      minutes: DIRECT_CALL_MINUTES,
    });

    return {
      success: true,
      kind: "direct",
      grant,
      callId,
      withNames: othersInCall(
        {
          ...(found.data as PartyShapedCall),
          status: "active",
          participants: Array.from(
            new Set([...callParticipants(found.data as PartyShapedCall), caller.uid])
          ),
        },
        caller.uid
      ),
    };
  } catch (err: any) {
    console.error("[CallAction] Failed to answer call:", err);
    return { success: false, error: err?.message || "Could not join the call." };
  }
}

/**
 * Rings a teammate into a call already running — a direct call, or a
 * scheduled one.
 *
 * The ring is its own `calls` document — the callee's phone listens for
 * `to == me, status == ringing` and nothing else, so anything that is
 * to make it ring has to look like a call. It points at what it opens
 * onto through `joinsCallId` or `joinsEventId`, and answering it closes
 * it and puts the answerer on that call. It never becomes a call of its
 * own.
 */
export async function addToCallAction(input: unknown): Promise<CallActionResult> {
  try {
    const parsed = addToCallSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
    }
    const { callId, eventId, targetUid } = parsed.data;

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    /* What is being added to. The two kinds keep their party in
       different places — a direct call on its own document, a scheduled
       call on its engagement — and this is the one function that has to
       know the difference. Both come out as the same facts. */
    let party: {
      status: "active" | "ended";
      orgId: string;
      roomId: string;
      participants: string[];
      ringField: "joinsCallId" | "joinsEventId";
      ringTarget: string;
      projectId: string | null;
    };

    if (callId) {
      const found = await requireCallParticipant(callId, caller.uid, caller.orgId);
      if (!found.ok) return { success: false, error: found.error };
      party = {
        status: found.data.status === "active" ? "active" : "ended",
        orgId: found.data.orgId as string,
        roomId: found.data.roomId as string,
        participants: callParticipants(found.data as PartyShapedCall),
        ringField: "joinsCallId",
        ringTarget: callId,
        projectId: null,
      };
    } else {
      const eventSnap = await adminDb.collection(EVENTS).doc(eventId!).get();
      if (!eventSnap.exists) return { success: false, error: "That call no longer exists." };
      const event = eventSnap.data()!;
      if (event.orgId !== caller.orgId) return { success: false, error: "Unauthorized." };

      const attendees = (event.attendees as string[]) ?? [];
      /* "Running" for an engagement means inside its join window and
         hosted here — the same test the calendar's Join button passes.
         The caller has to be on it, which `canAddToCall` checks again
         through the participant list. */
      const live = canJoinScheduledCall(scheduledFacts(event, attendees.includes(caller.uid)));
      party = {
        status: live.allowed ? "active" : "ended",
        orgId: event.orgId as string,
        roomId: (event.roomId as string) ?? "",
        /* Guests count as bodies in the room but cannot be rung, so they
           take seats without ever being a target. */
        participants: [...attendees, ...(((event.guests as string[]) ?? []))],
        ringField: "joinsEventId",
        ringTarget: eventSnap.id,
        projectId: (event.projectId as string | null) ?? null,
      };
    }

    const [targetSnap, limits, ringingSnap] = await Promise.all([
      adminDb.collection("users").doc(targetUid).get(),
      resolveCallLimits(caller.orgId),
      /* Rings already out for this call, counted against the seats. */
      adminDb
        .collection(CALLS)
        .where(party.ringField, "==", party.ringTarget)
        .where("status", "==", "ringing")
        .get(),
    ]);

    if (!targetSnap.exists) {
      return { success: false, error: "That operative was not found." };
    }
    const target = targetSnap.data()!;

    const now = Date.now();
    const pending = ringingSnap.docs
      .filter(
        (doc) =>
          ((doc.data().ringingExpiresAt as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0) > now
      )
      .map((doc) => doc.data().to as string);

    const decision = canAddToCall({
      callStatus: party.status,
      callOrgId: party.orgId,
      participants: party.participants,
      pending,
      callerUid: caller.uid,
      callerOrgId: caller.orgId,
      targetUid,
      targetOrgId: (target.orgId as string) ?? "",
      seats: callId
        ? directCallSeats(limits.maxParticipants)
        : scheduledCallSeats(limits),
    });
    if (!decision.allowed) return { success: false, error: decision.message };

    const stamp = AdminTimestamp.now();
    const ref = await adminDb.collection(CALLS).add({
      orgId: caller.orgId,
      roomId: party.roomId,
      from: caller.uid,
      to: targetUid,
      fromName: caller.name,
      toName: (target.name as string) || "Operative",
      /* A ring has no party of its own; the call it opens onto does. */
      participants: [],
      participantNames: {},
      joinsCallId: callId ?? null,
      joinsEventId: eventId ?? null,
      status: "ringing",
      ringingExpiresAt: AdminTimestamp.fromDate(new Date(now + RING_TIMEOUT_SECONDS * 1000)),
      createdAt: stamp,
      answeredAt: null,
      endedAt: null,
      endedBy: null,
    });

    await logActivity({
      eventType: "CALL_STARTED",
      orgId: caller.orgId,
      projectId: party.projectId,
      actor: { uid: caller.uid, name: caller.name },
      metadata: {
        callId: ref.id,
        addedToCallId: callId ?? null,
        addedToEventId: eventId ?? null,
        to: targetUid,
        toName: (target.name as string) || null,
      },
    });

    // Same bargain as `startCallAction`: not awaited, swallows its own failures.
    void sendCallPush({
      toUid: targetUid,
      fromName: caller.name,
      callId: ref.id,
    });

    return { success: true, callId: ref.id };
  } catch (err: any) {
    console.error("[CallAction] Failed to add to call:", err);
    return { success: false, error: err?.message || "Could not add them to the call." };
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

    /* Hanging up from a call that has grown past a pair is leaving it,
       not ending it: the others are still talking. The document is
       ended only when this departure would leave fewer than two —
       decided inside a transaction, because two people hanging up in
       the same second must not both read "three" and both merely leave,
       stranding the last person in a call the record says is live. */
    if (status === "ended" && found.data.status === "active") {
      await adminDb.runTransaction(async (tx) => {
        const fresh = await tx.get(found.ref);
        const data = fresh.data();
        if (!data || data.status !== "active") return;

        const remaining = callParticipants(data as PartyShapedCall).filter(
          (id) => id !== caller.uid
        );

        if (remaining.length >= 2) {
          tx.update(found.ref, {
            participants: remaining,
            [`participantNames.${caller.uid}`]: FieldValue.delete(),
          });
          return;
        }

        tx.update(found.ref, {
          status: "ended",
          participants: remaining,
          endedAt: AdminTimestamp.now(),
          endedBy: caller.uid,
        });
      });
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
