"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { subscribeToTranscriptSession } from "@/lib/queries/transcripts";
import { shouldCapture } from "@/lib/transcripts/consent";
import {
  FLUSH_INTERVAL_MS,
  HARD_MAX_LINES_PER_FLUSH,
} from "@/lib/transcripts/ceiling";
import {
  SPEECH_FAILURE_MESSAGE,
  createRecognizer,
  speechRecognitionSupported,
  type RecognizerHandle,
  type SpeechFailure,
} from "@/lib/transcripts/speech";
import {
  appendTranscriptLinesAction,
  endTranscriptAction,
  requestTranscriptAction,
  respondToTranscriptAction,
  settleTranscriptRequestAction,
} from "@/app/actions/transcripts";
import type {
  ConsentDecision,
  TranscriptCallKind,
  TranscriptSession,
  TranscriptStatus,
} from "@/types/transcript";

/* ------------------------------------------------------------------ */
/*  Transcription, from inside a call                                  */
/*                                                                     */
/*  Owns one recognizer and the buffer behind it. Mounted by the call  */
/*  shell, so it lives exactly as long as the room does and ends the   */
/*  transcript on the way out however the way out was reached —        */
/*  hanging up, the provider ejecting everyone, or the tab closing.    */
/*  That is the same bargain `group-call` makes about leaving a room,  */
/*  and for the same reason: a transcript left open is one that never  */
/*  becomes downloadable.                                              */
/*                                                                     */
/*  Lines are buffered rather than written as they arrive. A sentence  */
/*  is a document write, people speak in bursts, and five seconds of   */
/*  talking is one round trip instead of a dozen.                      */
/* ------------------------------------------------------------------ */

export interface TranscriptionCall {
  roomId: string;
  callKind: TranscriptCallKind;
  callId?: string | null;
  conversationId?: string | null;
  /** What the call is called. Becomes the transcript's file name. */
  title: string;
}

interface PendingLine {
  seq: number;
  at: number;
  text: string;
}

export interface TranscriptionState {
  /** False on Firefox, and on anything else without speech recognition. */
  supported: boolean;
  session: TranscriptSession | null;
  status: TranscriptStatus | null;
  ownDecision: ConsentDecision | null;
  /** This browser is listening to this person's microphone right now. */
  capturing: boolean;
  /** The consent prompt should be on screen. */
  needsAnswer: boolean;
  busy: boolean;
  /** Something the operator needs to read: a refusal, or a dead microphone. */
  notice: string | null;
  dismissNotice: () => void;
  request: () => void;
  respond: (decision: ConsentDecision) => void;
}

export function useTranscription(call: TranscriptionCall | null): TranscriptionState {
  const { user } = useAuth();
  const uid = user?.id ?? null;

  const [session, setSession] = useState<TranscriptSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const supported = useMemo(() => speechRecognitionSupported(), []);

  const status = session?.status ?? null;
  const ownDecision = (uid && session?.consent?.[uid]?.decision) || null;
  const capturing = Boolean(status && shouldCapture({ status, ownDecision }));

  /* ── The session document ── */
  useEffect(() => {
    if (!call?.roomId) {
      setSession(null);
      return;
    }
    return subscribeToTranscriptSession(call.roomId, setSession);
  }, [call?.roomId]);

  /* ── Asking, and answering ── */

  const request = useCallback(() => {
    if (!call) return;
    setBusy(true);
    setNotice(null);

    void requestTranscriptAction({
      roomId: call.roomId,
      callKind: call.callKind,
      callId: call.callId ?? undefined,
      conversationId: call.conversationId ?? undefined,
      title: call.title,
    }).then((result) => {
      if (!result.success) setNotice(result.error);
      setBusy(false);
    });
  }, [call]);

  const respond = useCallback(
    (decision: ConsentDecision) => {
      if (!call) return;
      setBusy(true);

      void respondToTranscriptAction({ roomId: call.roomId, decision }).then((result) => {
        if (!result.success) setNotice(result.error);
        setBusy(false);
      });
    },
    [call]
  );

  /* A window that lapses with nobody having finished answering has to be
     closed by somebody, and there is no cron for it. Whoever is still
     looking at the prompt asks for the tally to be taken; the server
     decides the outcome, so several clients asking at once is harmless. */
  useEffect(() => {
    if (!call?.roomId || status !== "pending") return;

    const deadline = session?.decisionDeadline?.toMillis?.() ?? 0;
    const delay = Math.max(deadline - Date.now(), 0) + 500;

    const timer = setTimeout(() => {
      void settleTranscriptRequestAction({ roomId: call.roomId });
    }, delay);

    return () => clearTimeout(timer);
  }, [call?.roomId, status, session?.decisionDeadline]);

  /* ── Capture ── */

  const bufferRef = useRef<PendingLine[]>([]);
  const seqRef = useRef(0);
  const flushingRef = useRef(false);
  const fullRef = useRef(false);
  const roomRef = useRef<string | null>(null);
  roomRef.current = call?.roomId ?? null;

  /* Whether this browser ever started listening. The teardown below uses
     it to decide whether there is a transcript to close at all. */
  const engagedRef = useRef(false);

  const flush = useCallback(async () => {
    const roomId = roomRef.current;
    if (!roomId || flushingRef.current || fullRef.current) return;
    if (bufferRef.current.length === 0) return;

    flushingRef.current = true;
    /* Taken out of the buffer before the round trip, so speech that
       arrives mid-flight queues for the next one rather than being sent
       twice. A failed send puts them back. */
    const batch = bufferRef.current.splice(0, HARD_MAX_LINES_PER_FLUSH);

    try {
      const result = await appendTranscriptLinesAction({ roomId, lines: batch });
      if (result.success && result.full) fullRef.current = true;
      if (!result.success) bufferRef.current.unshift(...batch);
    } catch {
      bufferRef.current.unshift(...batch);
    } finally {
      flushingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!capturing) return;

    if (!supported) {
      setNotice(SPEECH_FAILURE_MESSAGE.unsupported);
      return;
    }

    engagedRef.current = true;
    fullRef.current = false;

    let recognizer: RecognizerHandle | null = createRecognizer({
      onFinal: (text) => {
        if (fullRef.current) return;
        seqRef.current += 1;
        bufferRef.current.push({ seq: seqRef.current, at: Date.now(), text });
        if (bufferRef.current.length >= HARD_MAX_LINES_PER_FLUSH) void flush();
      },
      onFailure: (failure: SpeechFailure) => setNotice(SPEECH_FAILURE_MESSAGE[failure]),
    });

    if (!recognizer) {
      setNotice(SPEECH_FAILURE_MESSAGE.unsupported);
      return;
    }

    recognizer.start();
    const timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);

    /* A tab closed outright never unmounts anything. This is the same
       goodbye, attempted on the way out — it often will not land, which
       is why nothing rests on it. */
    const sayGoodbye = () => {
      recognizer?.stop();
      void flush();
    };
    window.addEventListener("pagehide", sayGoodbye);

    return () => {
      window.removeEventListener("pagehide", sayGoodbye);
      clearInterval(timer);
      recognizer?.stop();
      recognizer = null;
      void flush();
    };
  }, [capturing, supported, flush]);

  /* ── The way out ── */

  /* Mirrored where the unmount cleanup can reach it: an effect that
     closes the transcript cannot depend on the state that says whether
     there is one, or it would re-run and close it mid-call. */
  const liveRef = useRef(false);
  liveRef.current = status === "recording" || status === "pending";

  useEffect(() => {
    const roomId = call?.roomId;
    if (!roomId) return;

    return () => {
      if (!liveRef.current && !engagedRef.current) return;
      engagedRef.current = false;

      /* The last lines first, then the close — the server refuses an
         append to a transcript that has already ended, so the order here
         is the difference between a final sentence and a lost one. */
      void flush().then(() => endTranscriptAction({ roomId }));
    };
  }, [call?.roomId, flush]);

  const needsAnswer = Boolean(
    session &&
      uid &&
      !ownDecision &&
      (status === "pending" || status === "recording")
  );

  return {
    supported,
    session,
    status,
    ownDecision,
    capturing,
    needsAnswer,
    busy,
    notice,
    dismissNotice: useCallback(() => setNotice(null), []),
    request,
    respond,
  };
}
