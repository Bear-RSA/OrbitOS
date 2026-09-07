import { Timestamp } from "firebase/firestore";

/* ------------------------------------------------------------------ */
/*  Transcript schema                                                  */
/*                                                                     */
/*  A transcript is a record of a call, and it is the one artefact in  */
/*  OrbitOS that exists only because people agreed to it. That shows   */
/*  up in the shape: consent is not a flag set once at the start, it   */
/*  is a per-person decision stored alongside the text, so the finished*/
/*  transcript can always say who was captured and who was not.        */
/*                                                                     */
/*  Keyed by `roomId` rather than by call id, because the two kinds of */
/*  call disagree about where they live — a direct call is a `calls`   */
/*  document, a group call is a field on a conversation — and the room */
/*  is the only identifier both have. Both mint a fresh one per call   */
/*  (`newRoomId()`), so the id never collides with a previous meeting  */
/*  in the same thread.                                                */
/* ------------------------------------------------------------------ */

/**
 * Which engine produced the lines.
 *
 * `webspeech` is per-participant capture in the browser: each person's
 * own microphone, transcribed locally, merged on the server. It is the
 * only engine that works while the room is a cross-origin Daily Prebuilt
 * iframe, because the app cannot reach the room's mixed audio at all.
 *
 * Named rather than assumed for the same reason `CallProviderId` is: if
 * this ever moves to provider-side transcription, the stored transcripts
 * have to keep saying how they were made.
 */
export type TranscriptEngineId = "webspeech";

/**
 * `pending` is the only state consent can be given from, and it is
 * time-bounded — see `decisionDeadline`.
 *
 * `declined` means the room never reached a majority. It is kept rather
 * than deleted so a second request cannot quietly re-ask a question the
 * room has already answered.
 */
export type TranscriptStatus = "pending" | "recording" | "declined" | "ended";

export type ConsentDecision = "accepted" | "declined";

/** What one person said when they were asked. */
export interface TranscriptConsent {
  name: string;
  decision: ConsentDecision;
  at: Timestamp;
}

/** Which side of the call this transcript belongs to. */
export type TranscriptCallKind = "direct" | "group";

export interface TranscriptSession {
  id: string;
  orgId: string;

  /** Opaque room capability — see `lib/calls/room-id`. Also the doc id. */
  roomId: string;

  callKind: TranscriptCallKind;
  /** Set for a direct call. */
  callId?: string | null;
  /** Set for a group call. */
  conversationId?: string | null;

  /**
   * What the call was called, denormalized at request time. It becomes
   * the downloaded file's name, and resolving it later would mean
   * reading a conversation that may since have been renamed — or a
   * direct call whose row is gone.
   */
  title: string;

  status: TranscriptStatus;
  engine: TranscriptEngineId;

  requestedBy: string;
  requestedByName: string;
  requestedAt: Timestamp;

  /** When the room stops being able to answer the question. */
  decisionDeadline: Timestamp;

  /**
   * How many people were in the call when consent was asked.
   *
   * Frozen at that moment on purpose. A majority measured against a
   * headcount that moves is a majority that can be lost by someone
   * walking out, and a transcript that stops mid-sentence because a
   * fourth person left is worse than one that runs to the end.
   */
  headcount: number;

  consent: Record<string, TranscriptConsent>;

  startedAt: Timestamp | null;
  endedAt: Timestamp | null;
  lineCount: number;

  /** Set once the transcript has been filed to the Vault. */
  vaultDocumentId?: string | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * One final utterance, attributed to the microphone that produced it.
 *
 * There is no diarization here and there does not need to be: every line
 * arrives from one person's own browser, so the speaker is known rather
 * than guessed.
 *
 * `seq` is that speaker's own counter, not a position in the transcript.
 * Two people talking at once both write a line 7, which is why the
 * document id carries the uid as well — see `lineDocumentId`.
 */
export interface TranscriptLine {
  uid: string;
  name: string;
  seq: number;
  /** Unix millis, from the speaker's clock. Ordering is by this. */
  at: number;
  text: string;
}

/**
 * The composite id a line is stored under.
 *
 * Deterministic, so a flush that is retried — and they are retried,
 * because the last one leaves a browser that is closing — overwrites its
 * own line rather than adding a duplicate of it.
 */
export function lineDocumentId(uid: string, seq: number): string {
  return `${uid}_${String(seq).padStart(6, "0")}`;
}

/* ------------------------------------------------------------------ */
/*  Usage                                                              */
/* ------------------------------------------------------------------ */

/**
 * The running monthly total, stored at
 * `organizations/{orgId}.transcriptUsage`.
 *
 * Carries its own period key rather than living in a dated subcollection:
 * the counter is read on every request and written once per call, and a
 * month that has rolled over is cheaper to detect here than to query for.
 */
export interface TranscriptUsage {
  /** `YYYY-MM`, in UTC. A different key means the count starts again. */
  periodKey: string;
  sessions: number;
  lines: number;
}

export const EMPTY_TRANSCRIPT_USAGE: TranscriptUsage = {
  periodKey: "",
  sessions: 0,
  lines: 0,
};

/** The period a moment falls in. UTC, so a workspace cannot gain a month by travelling. */
export function periodKeyFor(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}
