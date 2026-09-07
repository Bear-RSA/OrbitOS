import type { ConsentDecision, TranscriptStatus } from "@/types/transcript";

/* ------------------------------------------------------------------ */
/*  Consent                                                            */
/*                                                                     */
/*  The rule the whole feature rests on, kept pure and free of         */
/*  Firestore so it can be tested directly — the same bargain          */
/*  `lib/calls/access` and `lib/vault/access` make.                    */
/*                                                                     */
/*  A majority here is STRICT: more than half, never exactly half.     */
/*  The arithmetic matters most at the smallest size, which is also    */
/*  the most common one. In a call between two people a strict         */
/*  majority is both of them, so nobody can transcribe a one-to-one    */
/*  conversation by voting for it alone. Half-or-more would have made  */
/*  the requester's own click sufficient, which is not consent, it is  */
/*  a formality wrapped around a decision already taken.               */
/* ------------------------------------------------------------------ */

/** Just the decision — the stored record carries a name and a time too. */
export interface ConsentRecord {
  decision: ConsentDecision;
}

export interface ConsentTally {
  accepted: number;
  declined: number;
  /** Everyone who has answered, either way. */
  responded: number;
  /** People in the call who have not answered yet. */
  outstanding: number;
}

export function tallyConsent(
  consent: Record<string, ConsentRecord> | undefined | null,
  headcount: number
): ConsentTally {
  let accepted = 0;
  let declined = 0;

  for (const record of Object.values(consent ?? {})) {
    if (record?.decision === "accepted") accepted += 1;
    else if (record?.decision === "declined") declined += 1;
  }

  const heads = Number.isFinite(headcount) && headcount > 0 ? Math.floor(headcount) : 0;
  const responded = accepted + declined;

  return {
    accepted,
    declined,
    responded,
    outstanding: Math.max(heads - responded, 0),
  };
}

/** More than half. Never exactly half — see the note at the top. */
export function hasMajority(accepted: number, headcount: number): boolean {
  if (!Number.isFinite(accepted) || !Number.isFinite(headcount)) return false;
  if (headcount <= 0) return false;
  return accepted * 2 > headcount;
}

/**
 * Whether enough people have already refused that a majority can no
 * longer be reached.
 *
 * Worth answering separately from "has a majority": a room where the
 * answer is settled should be told so at once rather than sitting in
 * front of a prompt for the rest of the window.
 */
export function majorityUnreachable(declined: number, headcount: number): boolean {
  if (!Number.isFinite(declined) || !Number.isFinite(headcount)) return false;
  if (headcount <= 0) return true;
  return declined * 2 >= headcount;
}

/** Whether the room can still answer. */
export function consentWindowOpen(deadlineMillis: number, now: number): boolean {
  if (!Number.isFinite(deadlineMillis)) return false;
  return now < deadlineMillis;
}

/**
 * What a pending session should become, given who has answered and how
 * much time is left.
 *
 * Returns `pending` while the question is genuinely still open, which is
 * the only state that does not cause a write.
 */
export function resolveConsentOutcome(params: {
  consent: Record<string, ConsentRecord> | undefined | null;
  headcount: number;
  deadlineMillis: number;
  now: number;
}): TranscriptStatus {
  const { consent, headcount, deadlineMillis, now } = params;
  const tally = tallyConsent(consent, headcount);

  if (hasMajority(tally.accepted, headcount)) return "recording";
  if (majorityUnreachable(tally.declined, headcount)) return "declined";

  /* The window closing without a majority is a no. Silence is not
     agreement, and a transcript that starts because two people were
     away from their keyboard is exactly the failure the prompt exists
     to prevent. */
  if (!consentWindowOpen(deadlineMillis, now)) return "declined";

  return "pending";
}

/* ------------------------------------------------------------------ */
/*  Gates                                                              */
/* ------------------------------------------------------------------ */

export interface ConsentDenied {
  allowed: boolean;
  message?: string;
}

/**
 * Whether a transcript may be asked for in this room at all.
 *
 * `existing` is whatever session document the room already has. A room
 * that has already answered is not asked twice: a request that could be
 * repeated turns a decline into a question people have to keep saying no
 * to, which is how consent prompts become something everyone clicks
 * through without reading.
 */
export function canRequestTranscript(params: {
  existing: { status: TranscriptStatus } | null;
  isParticipant: boolean;
}): ConsentDenied {
  if (!params.isParticipant) {
    return { allowed: false, message: "You are not in this call." };
  }

  const status = params.existing?.status;

  if (status === "pending") {
    return { allowed: false, message: "The room is already being asked." };
  }
  if (status === "recording") {
    return { allowed: false, message: "This call is already being transcribed." };
  }
  if (status === "declined") {
    return {
      allowed: false,
      message: "The room decided against transcribing this call.",
    };
  }
  if (status === "ended") {
    return {
      allowed: false,
      message: "This call already has a transcript.",
    };
  }

  return { allowed: true };
}

/**
 * Whether this person's browser should be capturing.
 *
 * Deliberately narrow: recording, and this particular person said yes.
 * Someone who declined sits in a call that is being transcribed and
 * contributes nothing to it, which is the whole promise made to them.
 */
export function shouldCapture(params: {
  status: TranscriptStatus;
  ownDecision: ConsentDecision | null;
}): boolean {
  return params.status === "recording" && params.ownDecision === "accepted";
}
