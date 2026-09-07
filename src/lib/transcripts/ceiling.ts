import {
  EMPTY_TRANSCRIPT_USAGE,
  periodKeyFor,
  type TranscriptUsage,
} from "@/types/transcript";

/* ------------------------------------------------------------------ */
/*  Transcript cost ceilings                                           */
/*                                                                     */
/*  ALWAYS on, independent of BILLING_GUARDRAILS_ENABLED — the same    */
/*  split the vault ceilings, the call ceilings and the invite         */
/*  dispatcher already make.                                           */
/*                                                                     */
/*  What is being protected here is NOT a speech vendor. Capture runs  */
/*  in the participants' own browsers and costs nothing per minute.    */
/*  The bill is Firestore: every utterance in every call is a document */
/*  write, and a recognizer left running in an empty room writes until */
/*  somebody notices. These numbers are what stops that being a        */
/*  surprise on a Blaze invoice.                                       */
/*                                                                     */
/*  The tier limit in `resolveTranscriptLimit` narrows these; nothing  */
/*  ever widens them. A tier returning -1 means "the plan does not     */
/*  narrow it", not "unlimited".                                       */
/* ------------------------------------------------------------------ */

/**
 * Transcribed calls one workspace may start in a month.
 *
 * Set well above what a studio holding stand-ups every morning would
 * reach, and well below the point where a loop placing calls in the
 * background becomes an invoice worth arguing about.
 */
export const HARD_MAX_SESSIONS_PER_MONTH = 500;

/**
 * Lines one transcript may hold.
 *
 * Roughly a four-hour meeting at conversational pace, which is the
 * longest a room can stay open anyway (`HARD_MAX_ROOM_MINUTES`). Past
 * this the transcript stops growing and the call carries on — a capped
 * record of a long meeting is worth more than a dropped one.
 */
export const HARD_MAX_LINES_PER_SESSION = 5_000;

/**
 * Characters kept from one utterance.
 *
 * The Web Speech API returns a phrase at a time, so a real line is a
 * sentence. Anything past this is a recognizer that has stopped
 * segmenting, and storing the whole of it would put one runaway result
 * into every reader's transcript.
 */
export const HARD_MAX_CHARS_PER_LINE = 500;

/**
 * Lines one flush may carry.
 *
 * Sized to a single Firestore batch, and it doubles as the rate limit:
 * a client that has more than this waiting sends the oldest and keeps
 * the rest for the next tick rather than opening an unbounded write.
 */
export const HARD_MAX_LINES_PER_FLUSH = 25;

/** How often a client sends what it has, in milliseconds. */
export const FLUSH_INTERVAL_MS = 5_000;

/**
 * How long the room has to answer the consent question.
 *
 * The same 45 seconds a direct call rings for, and for the same reason:
 * it is about as long as a person will look at a prompt before deciding
 * it is broken. Enforced server-side at tally time rather than by a
 * cleanup job, so a `pending` document nobody tidied up is already
 * unanswerable.
 */
export const CONSENT_WINDOW_SECONDS = 45;

/* ------------------------------------------------------------------ */
/*  Clamps                                                             */
/* ------------------------------------------------------------------ */

/**
 * The narrower of the plan's monthly allowance and the ceiling.
 *
 * `tierMax` of -1 means the plan does not narrow it, so the ceiling
 * stands alone. Zero is a real answer and passes through untouched —
 * it is how the free tier says "not on this plan".
 */
export function transcriptSessionAllowance(tierMax: number): number {
  if (!Number.isFinite(tierMax) || tierMax < 0) return HARD_MAX_SESSIONS_PER_MONTH;
  return Math.min(Math.floor(tierMax), HARD_MAX_SESSIONS_PER_MONTH);
}

/**
 * One utterance, trimmed to what will be stored.
 *
 * Returns an empty string for anything that is not usable text, and the
 * callers treat that as "no line" rather than storing a blank row.
 */
export function cleanLineText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, HARD_MAX_CHARS_PER_LINE);
}

/* ------------------------------------------------------------------ */
/*  Usage                                                              */
/* ------------------------------------------------------------------ */

/**
 * Reads the running monthly total off an organization document.
 *
 * Tolerant on purpose: every workspace that existed before transcripts
 * has no counter, and a missing one has to mean "none this month"
 * rather than blocking the first transcript of every existing org.
 *
 * A counter from a previous month reads as zero. The stored document is
 * only rewritten when a transcript actually ends, so last month's number
 * sits there until then and must never be mistaken for this month's.
 */
export function readTranscriptUsage(
  orgData: unknown,
  at: Date = new Date()
): TranscriptUsage {
  const period = periodKeyFor(at);
  const usage = (orgData as { transcriptUsage?: unknown } | undefined)
    ?.transcriptUsage as Partial<TranscriptUsage> | undefined;

  if (!usage || typeof usage !== "object" || usage.periodKey !== period) {
    return { ...EMPTY_TRANSCRIPT_USAGE, periodKey: period };
  }

  const sessions = Number(usage.sessions);
  const lines = Number(usage.lines);

  return {
    periodKey: period,
    sessions: Number.isFinite(sessions) && sessions > 0 ? Math.floor(sessions) : 0,
    lines: Number.isFinite(lines) && lines > 0 ? Math.floor(lines) : 0,
  };
}

/**
 * The totals after one more transcript of `lines` is recorded.
 *
 * Never goes down, and never leaves the current period: a usage document
 * written under last month's key would hand the workspace a second free
 * allowance for the same month.
 */
export function applyTranscriptDelta(
  usage: TranscriptUsage,
  lines: number
): TranscriptUsage {
  const added = Number.isFinite(lines) && lines > 0 ? Math.floor(lines) : 0;
  return {
    periodKey: usage.periodKey || periodKeyFor(),
    sessions: usage.sessions + 1,
    lines: usage.lines + added,
  };
}

/* ------------------------------------------------------------------ */
/*  Admission                                                          */
/* ------------------------------------------------------------------ */

export interface TranscriptAdmission {
  allowed: boolean;
  /** Reader-facing, and specific about which limit was reached. */
  error?: string;
}

/**
 * Whether this workspace may start one more transcript this month.
 *
 * Checked before the consent question is asked rather than after it is
 * answered. A room that votes yes and is then told the workspace is out
 * of transcripts has been asked to agree to nothing.
 */
export function admitTranscriptSession(params: {
  usedSessions: number;
  maxSessions: number;
}): TranscriptAdmission {
  const { usedSessions, maxSessions } = params;

  if (maxSessions <= 0) {
    return {
      allowed: false,
      error: "Transcribing a meeting requires a paid plan.",
    };
  }

  if (usedSessions >= maxSessions) {
    return {
      allowed: false,
      error: `This workspace has transcribed ${maxSessions} meeting${
        maxSessions === 1 ? "" : "s"
      } this month. The allowance resets next month, or move up a plan.`,
    };
  }

  return { allowed: true };
}
