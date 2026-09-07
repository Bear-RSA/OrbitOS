"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { TranscriptionState } from "@/hooks/use-transcription";

/* ------------------------------------------------------------------ */
/*  The consent question                                               */
/*                                                                     */
/*  The one screen this whole feature exists behind. It is built on    */
/*  `ConfirmDialog` rather than on a bespoke modal so it looks like     */
/*  every other decision in the product — a prompt that announces      */
/*  itself as special is a prompt people learn to click through.       */
/*                                                                     */
/*  Dismissing it — Escape, or clicking away — records a DECLINE       */
/*  rather than leaving the question open. That is the safe direction: */
/*  it errs toward not recording somebody, and it means a person who   */
/*  wants no part of this can get rid of the prompt without hunting    */
/*  for the right button.                                              */
/*                                                                     */
/*  Three things are said out loud before anyone agrees, because each  */
/*  one is a surprise otherwise: the transcript is kept, the browser   */
/*  is about to ask for the microphone a SECOND time, and a browser    */
/*  that cannot do this contributes nothing.                           */
/* ------------------------------------------------------------------ */

interface TranscriptConsentDialogProps {
  state: TranscriptionState;
}

export function TranscriptConsentDialog({ state }: TranscriptConsentDialogProps) {
  const { session, status, needsAnswer, supported, busy, respond } = state;

  if (!session || !needsAnswer) return null;

  const asker = session.requestedByName || "Someone in this call";

  /* A late joiner is not being asked to decide anything for the room —
     the room has already decided. They are being asked about their own
     microphone, and the prompt should not pretend otherwise. */
  const alreadyRunning = status === "recording";

  const lines = [
    alreadyRunning
      ? `This call is being transcribed. ${asker} started it before you joined.`
      : `${asker} wants a written transcript of this call.`,
    alreadyRunning
      ? "Accepting adds your side of the conversation to it."
      : "It starts if most of the people here agree, and stops when the call ends.",
    "The transcript is saved to this workspace and anyone in the call can download it afterwards.",
    supported
      ? "Your own microphone is transcribed in this browser, so your browser will ask for it again — the call's permission belongs to the video service, not to OrbitOS."
      : "This browser cannot transcribe speech, so nothing you say will appear in it either way. Chrome or Edge can.",
    "Decline and you are not recorded.",
  ];

  return (
    <ConfirmDialog
      open
      /* The only way this closes is with an answer. */
      onOpenChange={(next) => {
        if (!next && !busy) respond("declined");
      }}
      title={alreadyRunning ? "This call is being transcribed" : "Transcribe this call?"}
      description={lines.join(" ")}
      confirmText={alreadyRunning ? "Include me" : "Transcribe it"}
      cancelText="Not for me"
      loading={busy}
      onConfirm={() => respond("accepted")}
    />
  );
}
