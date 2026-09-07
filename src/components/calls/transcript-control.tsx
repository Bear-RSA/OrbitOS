"use client";

import { Captions, CaptionsOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import { tallyConsent } from "@/lib/transcripts/consent";
import type { TranscriptionState } from "@/hooks/use-transcription";

/* ------------------------------------------------------------------ */
/*  The transcript control                                             */
/*                                                                     */
/*  Lives in the call shell's header, beside the microphone and the    */
/*  way out, and it is TWO things wearing one button: the way to ask   */
/*  for a transcript, and the sign that one is being taken.            */
/*                                                                     */
/*  The second job is the one that matters. A recording indicator that */
/*  only the people who agreed can see is not an indicator — somebody  */
/*  who declined is still in a room being transcribed, and they should */
/*  be able to see that at a glance for as long as it is true. So the  */
/*  lit state is painted from the SESSION, never from whether this     */
/*  particular browser is listening.                                   */
/* ------------------------------------------------------------------ */

interface TranscriptControlProps {
  state: TranscriptionState;
  /** The room is parked in the corner; there is space for a dot, not a word. */
  minimized: boolean;
}

export function TranscriptControl({ state, minimized }: TranscriptControlProps) {
  const { session, status, ownDecision, busy, request } = state;

  /* Nothing to show once the transcript is closed. The call is still
     running — somebody hit the line ceiling, or the room declined — and
     a dead control in the corner invites clicking. */
  if (status === "ended") return null;

  if (status === "recording") {
    const capturingMe = ownDecision === "accepted";

    return (
      <span
        role="status"
        aria-label={
          capturingMe
            ? "This call is being transcribed, including you"
            : "This call is being transcribed. You are not being recorded"
        }
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-lg border border-line/[0.06] bg-surface-control",
          minimized ? "h-7 px-2" : "h-7 px-2.5"
        )}
      >
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orbit-red opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orbit-red" />
        </span>
        {!minimized && (
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-dim">
            {capturingMe ? "Transcribing" : "Transcribing · not you"}
          </span>
        )}
      </span>
    );
  }

  /* Parked in the corner there is only room for the two controls that
     cannot wait — the microphone and the way out. Asking a room to vote
     on a transcript can wait until somebody looks at the call again. */
  if (minimized) return null;

  if (status === "pending") {
    const tally = tallyConsent(session?.consent, session?.headcount ?? 0);

    return (
      <span
        role="status"
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-line/[0.06] bg-surface-control px-2.5"
      >
        <Loader2 className="h-3 w-3 animate-spin text-ink-dim" aria-hidden />
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-dim">
          Asking · {tally.accepted}/{session?.headcount ?? 0}
        </span>
      </span>
    );
  }

  if (status === "declined") {
    return (
      <span
        role="status"
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-line/[0.06] px-2.5"
      >
        <CaptionsOff className="h-3.5 w-3.5 text-ink-dim" aria-hidden />
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-dim">
          Not transcribed
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={request}
      disabled={busy}
      aria-label="Ask the room to transcribe this call"
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-line/[0.06] bg-surface-control px-2.5",
        "text-ink transition-colors hover:bg-surface-raised disabled:opacity-40"
      )}
    >
      <Captions className="h-3.5 w-3.5" aria-hidden />
      <span className="font-mono text-[9px] uppercase tracking-[0.2em]">Transcribe</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Whatever the operator has to be told                               */
/* ------------------------------------------------------------------ */

/**
 * The one line that says why this is not working.
 *
 * Separate from the control because it is about this browser rather than
 * about the call: a refused microphone, a plan that does not carry
 * transcripts, a room that has already answered. Rendered under the
 * header so it cannot push the room's iframe around — moving that
 * element reloads it and drops the call.
 */
export function TranscriptNotice({
  state,
  minimized,
}: {
  state: TranscriptionState;
  minimized: boolean;
}) {
  /* Nothing at tile size. There is no room for a sentence beside a
     240px call, and the notice is still there when the room is opened
     back up. */
  if (minimized || !state.notice) return null;

  return (
    <div className="mb-2 flex shrink-0 items-start justify-between gap-3 rounded-lg border border-line/[0.06] bg-surface-control px-3 py-2">
      <p className="text-[11px] font-light leading-relaxed text-ink-muted">
        {state.notice}
      </p>
      <button
        type="button"
        onClick={state.dismissNotice}
        className="shrink-0 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-dim transition-colors hover:text-ink"
      >
        Dismiss
      </button>
    </div>
  );
}
