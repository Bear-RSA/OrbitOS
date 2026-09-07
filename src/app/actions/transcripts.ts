"use server";

import { FieldValue, Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireCaller, type Caller } from "@/lib/auth/caller";
import { resolveTranscriptLimit } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/telemetry";
import {
  canRequestTranscript,
  resolveConsentOutcome,
  type ConsentRecord,
} from "@/lib/transcripts/consent";
import {
  CONSENT_WINDOW_SECONDS,
  HARD_MAX_LINES_PER_SESSION,
  admitTranscriptSession,
  applyTranscriptDelta,
  cleanLineText,
  readTranscriptUsage,
  transcriptSessionAllowance,
} from "@/lib/transcripts/ceiling";
import { renderTranscript, transcriptFileName } from "@/lib/transcripts/render";
import {
  transcriptDecisionSchema,
  transcriptFilingSchema,
  transcriptLinesSchema,
  transcriptRequestSchema,
  transcriptRoomSchema,
} from "@/lib/validations/transcript";
import {
  lineDocumentId,
  type ConsentDecision,
  type TranscriptCallKind,
  type TranscriptLine,
  type TranscriptStatus,
} from "@/types/transcript";

/* ------------------------------------------------------------------ */
/*  Transcript server actions                                          */
/*                                                                     */
/*  Every one of these resolves the caller from the session cookie and */
/*  none accepts a uid — see `lib/auth/caller`. That matters more here */
/*  than almost anywhere else in the product: a line written under     */
/*  somebody else's name is a fabricated quote in a record the         */
/*  workspace keeps and may hand to a client.                          */
/*                                                                     */
/*  Clients never write these documents and never read the lines. The  */
/*  session document is readable so the room can see the consent       */
/*  question; the transcript itself only comes back through            */
/*  `getTranscriptAction`, after the caller has been checked against   */
/*  the list of people who were asked.                                 */
/* ------------------------------------------------------------------ */

const TRANSCRIPTS = "transcripts";
const LINES = "lines";
const CALLS = "calls";
const CONVERSATIONS = "conversations";
const ORGANIZATIONS = "organizations";

type ActionResult<T = object> =
  | ({ success: true } & T)
  | { success: false; error: string };

function sessionRef(roomId: string) {
  return adminDb.collection(TRANSCRIPTS).doc(roomId);
}

/* ------------------------------------------------------------------ */
/*  Who is in this call?                                               */
/* ------------------------------------------------------------------ */

interface CallSpec {
  roomId: string;
  callKind: TranscriptCallKind;
  callId?: string | null;
  conversationId?: string | null;
}

/** The caller, already narrowed to the half that has a uid. */
type ActiveCaller = Extract<Caller, { ok: true }>;

type Membership =
  | { ok: true; participants: Record<string, string>; headcount: number }
  | { ok: false; error: string };

/**
 * Confirms the caller is in the call this transcript belongs to, and
 * returns who else is.
 *
 * The room id is checked against the call rather than trusted from the
 * payload. A room id is a capability — it is the one field a client
 * could otherwise use to attach a transcript to somebody else's meeting
 * and be told, in the consent prompt, who is in it.
 *
 * Direct calls and group calls keep their participants in different
 * places, which is exactly why the transcript is keyed by room: this is
 * the one function that has to know the difference.
 */
async function membershipFor(caller: ActiveCaller, spec: CallSpec): Promise<Membership> {
  if (spec.callKind === "direct") {
    if (!spec.callId) return { ok: false, error: "That call no longer exists." };

    const snap = await adminDb.collection(CALLS).doc(spec.callId).get();
    if (!snap.exists) return { ok: false, error: "That call no longer exists." };

    const data = snap.data()!;
    if (data.orgId !== caller.orgId) return { ok: false, error: "Unauthorized." };
    if (data.roomId !== spec.roomId) return { ok: false, error: "Unauthorized." };
    if (data.from !== caller.uid && data.to !== caller.uid) {
      return { ok: false, error: "Unauthorized." };
    }

    return {
      ok: true,
      participants: {
        [data.from as string]: (data.fromName as string) || "Operative",
        [data.to as string]: (data.toName as string) || "Operative",
      },
      headcount: 2,
    };
  }

  if (!spec.conversationId) return { ok: false, error: "That call no longer exists." };

  const snap = await adminDb.collection(CONVERSATIONS).doc(spec.conversationId).get();
  if (!snap.exists) return { ok: false, error: "That conversation no longer exists." };

  const data = snap.data()!;
  if (data.orgId !== caller.orgId) return { ok: false, error: "Unauthorized." };

  const memberIds = (data.participantIds as string[]) ?? [];
  if (!memberIds.includes(caller.uid)) return { ok: false, error: "Unauthorized." };

  const call = data.activeCall as { roomId?: string; participants?: Record<string, string> } | null;
  if (!call || call.roomId !== spec.roomId) {
    return { ok: false, error: "That call has ended." };
  }

  const participants = call.participants ?? {};
  return {
    ok: true,
    participants,
    headcount: Math.max(Object.keys(participants).length, 1),
  };
}

/** The stored session, narrowed to the fields the actions reason about. */
interface StoredSession {
  orgId: string;
  roomId: string;
  callKind: TranscriptCallKind;
  callId?: string | null;
  conversationId?: string | null;
  title: string;
  status: TranscriptStatus;
  headcount: number;
  consent: Record<string, { name: string; decision: ConsentDecision }>;
  lineCount: number;
  startedAt?: FirebaseFirestore.Timestamp | null;
  endedAt?: FirebaseFirestore.Timestamp | null;
}

function narrow(data: FirebaseFirestore.DocumentData): StoredSession {
  return {
    orgId: (data.orgId as string) ?? "",
    roomId: (data.roomId as string) ?? "",
    callKind: data.callKind === "direct" ? "direct" : "group",
    callId: (data.callId as string) ?? null,
    conversationId: (data.conversationId as string) ?? null,
    title: (data.title as string) ?? "Meeting",
    status: (data.status as TranscriptStatus) ?? "ended",
    headcount: Number(data.headcount) || 0,
    consent: (data.consent as StoredSession["consent"]) ?? {},
    lineCount: Number(data.lineCount) || 0,
    startedAt: (data.startedAt as FirebaseFirestore.Timestamp) ?? null,
    endedAt: (data.endedAt as FirebaseFirestore.Timestamp) ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  Ask the room                                                       */
/* ------------------------------------------------------------------ */

/**
 * Puts the consent question to everyone in the call.
 *
 * The allowance is checked BEFORE anyone is asked, not after they
 * answer. A room that agrees to be transcribed and is then told the
 * workspace has run out has been asked to consent to nothing, and the
 * next prompt it sees is one it has learned to dismiss.
 */
export async function requestTranscriptAction(input: unknown): Promise<ActionResult> {
  try {
    const parsed = transcriptRequestSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid call.",
      };
    }
    const spec = parsed.data;

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const membership = await membershipFor(caller, spec);
    if (!membership.ok) return { success: false, error: membership.error };

    const [tierMax, orgSnap] = await Promise.all([
      resolveTranscriptLimit(caller.orgId),
      adminDb.collection(ORGANIZATIONS).doc(caller.orgId).get(),
    ]);

    const admission = admitTranscriptSession({
      usedSessions: readTranscriptUsage(orgSnap.data()).sessions,
      maxSessions: transcriptSessionAllowance(tierMax),
    });
    if (!admission.allowed) {
      return { success: false, error: admission.error ?? "Not available on this plan." };
    }

    const now = Date.now();
    const deadline = new Date(now + CONSENT_WINDOW_SECONDS * 1_000);
    const ref = sessionRef(spec.roomId);

    let refusal: string | null = null;

    /* Transactional because two people clicking in the same second must
       not produce two questions about the same call — the second one
       finds the first and is told the room is already being asked. */
    await adminDb.runTransaction(async (tx) => {
      const existing = await tx.get(ref);

      const gate = canRequestTranscript({
        existing: existing.exists ? { status: narrow(existing.data()!).status } : null,
        isParticipant: true,
      });
      if (!gate.allowed) {
        refusal = gate.message ?? "Not available.";
        return;
      }

      const consent: Record<string, ConsentRecord & { name: string; at: FirebaseFirestore.Timestamp }> = {
        [caller.uid]: {
          name: caller.name,
          decision: "accepted",
          at: AdminTimestamp.fromMillis(now),
        },
      };

      /* A room of one is already unanimous. Somebody sitting alone in a
         call transcribing their own notes should not have to wait out a
         window for a vote only they can cast. */
      const status = resolveConsentOutcome({
        consent,
        headcount: membership.headcount,
        deadlineMillis: deadline.getTime(),
        now,
      });

      tx.set(ref, {
        orgId: caller.orgId,
        roomId: spec.roomId,
        callKind: spec.callKind,
        callId: spec.callKind === "direct" ? spec.callId ?? null : null,
        conversationId: spec.callKind === "group" ? spec.conversationId ?? null : null,
        title: spec.title,
        status,
        engine: "webspeech",
        requestedBy: caller.uid,
        requestedByName: caller.name,
        requestedAt: AdminTimestamp.fromMillis(now),
        decisionDeadline: AdminTimestamp.fromDate(deadline),
        headcount: membership.headcount,
        consent,
        startedAt: status === "recording" ? AdminTimestamp.fromMillis(now) : null,
        endedAt: null,
        lineCount: 0,
        vaultDocumentId: null,
        createdAt: AdminTimestamp.fromMillis(now),
        updatedAt: AdminTimestamp.fromMillis(now),
      });
    });

    if (refusal) return { success: false, error: refusal };
    return { success: true };
  } catch (err) {
    console.error("[Transcript] Failed to ask the room:", err);
    return { success: false, error: "Could not ask the room." };
  }
}

/* ------------------------------------------------------------------ */
/*  Answer                                                             */
/* ------------------------------------------------------------------ */

/**
 * Records one person's decision and re-tallies the room.
 *
 * Answering while the call is already being transcribed is allowed and
 * does NOT re-open the vote: it is how somebody who joined late opts
 * their own microphone in or out of a decision the room already took.
 */
export async function respondToTranscriptAction(input: unknown): Promise<ActionResult> {
  try {
    const parsed = transcriptDecisionSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid response." };
    const { roomId, decision } = parsed.data;

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const ref = sessionRef(roomId);
    const first = await ref.get();
    if (!first.exists) return { success: false, error: "That request has expired." };

    const stored = narrow(first.data()!);
    const membership = await membershipFor(caller, {
      roomId,
      callKind: stored.callKind,
      callId: stored.callId,
      conversationId: stored.conversationId,
    });
    if (!membership.ok) return { success: false, error: membership.error };

    const now = Date.now();

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;

      const session = narrow(snap.data()!);
      if (session.status === "declined" || session.status === "ended") return;

      const consent = {
        ...session.consent,
        [caller.uid]: { name: caller.name, decision, at: AdminTimestamp.fromMillis(now) },
      };

      /* A late joiner's answer is about their own microphone only. The
         headcount this vote was measured against is frozen at the moment
         the question was asked, so re-tallying now would let somebody
         walking in overturn a decision already acted on. */
      if (session.status === "recording") {
        tx.update(ref, { consent, updatedAt: AdminTimestamp.fromMillis(now) });
        return;
      }

      const deadlineMillis =
        (snap.data()!.decisionDeadline as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0;

      const status = resolveConsentOutcome({
        consent,
        headcount: session.headcount,
        deadlineMillis,
        now,
      });

      tx.update(ref, {
        consent,
        status,
        ...(status === "recording" ? { startedAt: AdminTimestamp.fromMillis(now) } : {}),
        updatedAt: AdminTimestamp.fromMillis(now),
      });
    });

    return { success: true };
  } catch (err) {
    console.error("[Transcript] Failed to record a decision:", err);
    return { success: false, error: "Could not record your answer." };
  }
}

/**
 * Settles a request nobody finished answering.
 *
 * Called by the clients still looking at the prompt when the window
 * lapses. Server-side arithmetic decides the outcome either way — this
 * only asks for the tally to be taken, it cannot supply one.
 */
export async function settleTranscriptRequestAction(input: unknown): Promise<ActionResult> {
  try {
    const parsed = transcriptRoomSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid call." };

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const ref = sessionRef(parsed.data.roomId);
    const now = Date.now();

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;

      const session = narrow(snap.data()!);
      if (session.orgId !== caller.orgId) return;
      if (session.status !== "pending") return;

      const deadlineMillis =
        (snap.data()!.decisionDeadline as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0;

      const status = resolveConsentOutcome({
        consent: session.consent,
        headcount: session.headcount,
        deadlineMillis,
        now,
      });
      if (status === "pending") return;

      tx.update(ref, {
        status,
        ...(status === "recording" ? { startedAt: AdminTimestamp.fromMillis(now) } : {}),
        updatedAt: AdminTimestamp.fromMillis(now),
      });
    });

    return { success: true };
  } catch (err) {
    console.error("[Transcript] Failed to settle a request:", err);
    return { success: false, error: "Could not settle the request." };
  }
}

/* ------------------------------------------------------------------ */
/*  Capture                                                            */
/* ------------------------------------------------------------------ */

/**
 * Stores a handful of utterances from one speaker.
 *
 * `full` in the result is not an error — it is the ceiling being reached
 * on a call that is still going, and it tells the client to stop
 * listening rather than to retry.
 */
export async function appendTranscriptLinesAction(
  input: unknown
): Promise<ActionResult<{ stored: number; full: boolean }>> {
  try {
    const parsed = transcriptLinesSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid lines." };
    const { roomId, lines } = parsed.data;

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const ref = sessionRef(roomId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: "That transcript is gone." };

    const session = narrow(snap.data()!);
    if (session.orgId !== caller.orgId) return { success: false, error: "Unauthorized." };
    if (session.status !== "recording") {
      return { success: false, error: "This call is not being transcribed." };
    }

    /* The consent record is the authorization. Someone who declined has
       nothing to append with, whatever their client believes. */
    if (session.consent[caller.uid]?.decision !== "accepted") {
      return { success: false, error: "You are not being transcribed." };
    }

    if (session.lineCount >= HARD_MAX_LINES_PER_SESSION) {
      return { success: true, stored: 0, full: true };
    }

    const room = HARD_MAX_LINES_PER_SESSION - session.lineCount;
    const batch = adminDb.batch();
    let stored = 0;

    for (const line of lines) {
      if (stored >= room) break;
      const text = cleanLineText(line.text);
      if (!text) continue;

      /* Deterministic id, so the flush that fires from a closing tab and
         then gets retried overwrites its own line rather than doubling
         it. */
      batch.set(ref.collection(LINES).doc(lineDocumentId(caller.uid, line.seq)), {
        uid: caller.uid,
        name: caller.name,
        seq: line.seq,
        at: line.at,
        text,
      });
      stored += 1;
    }

    if (stored === 0) return { success: true, stored: 0, full: false };

    /* An increment rather than a write of a counted total: several
       people are appending at once and each knows only its own share. */
    batch.update(ref, {
      lineCount: FieldValue.increment(stored),
      updatedAt: AdminTimestamp.now(),
    });

    await batch.commit();

    return {
      success: true,
      stored,
      full: session.lineCount + stored >= HARD_MAX_LINES_PER_SESSION,
    };
  } catch (err) {
    console.error("[Transcript] Failed to store lines:", err);
    return { success: false, error: "Could not store the transcript." };
  }
}

/* ------------------------------------------------------------------ */
/*  End                                                                */
/* ------------------------------------------------------------------ */

/**
 * Closes the transcript and counts it against the month.
 *
 * Everybody in the call calls this on their way out, which is the point:
 * the transaction makes the first one land and the rest no-ops, so a
 * transcript is counted exactly once however many people hang up, and
 * still gets closed when the person who started it is the one whose
 * browser crashed.
 */
export async function endTranscriptAction(input: unknown): Promise<ActionResult> {
  try {
    const parsed = transcriptRoomSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid call." };

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const ref = sessionRef(parsed.data.roomId);
    const orgRef = adminDb.collection(ORGANIZATIONS).doc(caller.orgId);
    const now = Date.now();

    /* Held in an object rather than a bare local: the assignment happens
       inside the transaction callback, and a plain `let` would be read
       back as still null. */
    const outcome: {
      closed?: { title: string; lineCount: number; callKind: TranscriptCallKind };
    } = {};

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;

      const session = narrow(snap.data()!);
      if (session.orgId !== caller.orgId) return;
      if (!session.consent[caller.uid]) return;

      /* A call that ends while the room is still deciding is a question
         that was never answered, and silence is a no. */
      if (session.status === "pending") {
        tx.update(ref, {
          status: "declined",
          endedAt: AdminTimestamp.fromMillis(now),
          updatedAt: AdminTimestamp.fromMillis(now),
        });
        return;
      }

      if (session.status !== "recording") return;

      const orgSnap = await tx.get(orgRef);
      const usage = readTranscriptUsage(orgSnap.data(), new Date(now));

      tx.update(ref, {
        status: "ended",
        endedAt: AdminTimestamp.fromMillis(now),
        updatedAt: AdminTimestamp.fromMillis(now),
      });

      tx.set(
        orgRef,
        { transcriptUsage: applyTranscriptDelta(usage, session.lineCount) },
        { merge: true }
      );

      outcome.closed = {
        title: session.title,
        lineCount: session.lineCount,
        callKind: session.callKind,
      };
    });

    if (outcome.closed) {
      const record = outcome.closed;
      await logActivity({
        eventType: "MEETING_TRANSCRIBED",
        orgId: caller.orgId,
        projectId: null,
        actor: { uid: caller.uid, name: caller.name },
        metadata: {
          title: record.title,
          lines: record.lineCount,
          callKind: record.callKind,
        },
      });
    }

    return { success: true };
  } catch (err) {
    console.error("[Transcript] Failed to close a transcript:", err);
    return { success: false, error: "Could not close the transcript." };
  }
}

/* ------------------------------------------------------------------ */
/*  Read it back                                                       */
/* ------------------------------------------------------------------ */

export interface TranscriptPayload {
  title: string;
  text: string;
  fileName: string;
  lineCount: number;
  startedAt: number;
  endedAt: number;
  vaultDocumentId: string | null;
}

/**
 * The finished transcript, rendered.
 *
 * Authorized against the consent map rather than against the call, and
 * that is deliberate: by the time anyone wants to read this the call is
 * over, the room is gone and the participant list with it. Whoever was
 * asked to agree may read what was recorded. Nobody else can, including
 * other members of the same workspace.
 */
export async function getTranscriptAction(
  input: unknown
): Promise<ActionResult<{ transcript: TranscriptPayload }>> {
  try {
    const parsed = transcriptRoomSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid call." };

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const ref = sessionRef(parsed.data.roomId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: "That transcript is gone." };

    const session = narrow(snap.data()!);
    if (session.orgId !== caller.orgId || !session.consent[caller.uid]) {
      /* The same sentence a missing transcript gets. Telling somebody
         that a meeting they were not in exists is itself a disclosure. */
      return { success: false, error: "That transcript is gone." };
    }

    const startedAt = session.startedAt?.toMillis?.() ?? Date.now();
    const endedAt = session.endedAt?.toMillis?.() ?? startedAt;

    const lineSnap = await ref
      .collection(LINES)
      .orderBy("at", "asc")
      .limit(HARD_MAX_LINES_PER_SESSION)
      .get();

    const lines: TranscriptLine[] = lineSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        uid: (data.uid as string) ?? "",
        name: (data.name as string) ?? "Operative",
        seq: Number(data.seq) || 0,
        at: Number(data.at) || startedAt,
        text: (data.text as string) ?? "",
      };
    });

    const text = renderTranscript({
      title: session.title,
      startedAt,
      endedAt,
      lines,
      participants: Object.entries(session.consent).map(([uid, record]) => ({
        uid,
        name: record.name,
        decision: record.decision,
      })),
    });

    return {
      success: true,
      transcript: {
        title: session.title,
        text,
        fileName: transcriptFileName(session.title, startedAt),
        lineCount: lines.length,
        startedAt,
        endedAt,
        vaultDocumentId: (snap.data()!.vaultDocumentId as string) ?? null,
      },
    };
  } catch (err) {
    console.error("[Transcript] Failed to read a transcript:", err);
    return { success: false, error: "Could not open the transcript." };
  }
}

/**
 * Notes that this transcript now has a home in the Vault.
 *
 * Written after the fact rather than as part of filing, because the
 * upload itself runs in the browser against Cloudinary — see
 * `lib/vault/deposit`. The document id is the only part of that the
 * transcript needs to remember.
 */
export async function attachTranscriptVaultDocumentAction(
  input: unknown
): Promise<ActionResult> {
  try {
    const parsed = transcriptFilingSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid document." };

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const ref = sessionRef(parsed.data.roomId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: "That transcript is gone." };

    const session = narrow(snap.data()!);
    if (session.orgId !== caller.orgId || !session.consent[caller.uid]) {
      return { success: false, error: "That transcript is gone." };
    }

    await ref.update({
      vaultDocumentId: parsed.data.documentId,
      updatedAt: AdminTimestamp.now(),
    });

    return { success: true };
  } catch (err) {
    console.error("[Transcript] Failed to record the filing:", err);
    return { success: false, error: "Could not link the filed document." };
  }
}
