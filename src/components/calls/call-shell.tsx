"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
} from "lucide-react";
import { useCall } from "@/contexts/call-context";
import { useCallContinuity } from "@/hooks/use-call-continuity";
import { useRoomNotices } from "@/hooks/use-room-notices";
import { useTranscription, type TranscriptionCall } from "@/hooks/use-transcription";
import { RoomNotices } from "@/components/calls/room-notices";
import { TranscriptConsentDialog } from "@/components/calls/transcript-consent-dialog";
import { TranscriptControl, TranscriptNotice } from "@/components/calls/transcript-control";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Call shell                                                         */
/*                                                                     */
/*  The frame around every room — the ring you placed, the ring you    */
/*  answered, the group you walked into — and the one place that knows */
/*  how to get out of the way.                                         */
/*                                                                     */
/*  THE POINT OF THIS FILE IS THE DOM IT DOES NOT CHANGE. Minimizing   */
/*  swaps class names on elements that stay exactly where they were.   */
/*  It is tempting to render a small tile and a big one as two         */
/*  branches, and it works right up until you try it: moving an        */
/*  iframe in the document reloads it, and reloading this iframe means */
/*  rejoining the room, re-asking for the microphone, and a silence in */
/*  the middle of a sentence. So there is one header, one slot, one    */
/*  wrapper, and only their styling has an opinion about size.         */
/*                                                                     */
/*  Minimized, the room starts in a corner of the screen and can be    */
/*  dragged anywhere by its header, with the app usable around it. The provider's own controls are unreachable at   */
/*  that size, so the two that matter — the microphone and the way out */
/*  — are painted here and driven through the provider handle.         */
/* ------------------------------------------------------------------ */

interface CallShellProps {
  /** What the call is called: the corner tile, and the lock screen. */
  title: string;
  /**
   * What the bar says at full size. Defaults to naming the call, and is
   * overridden by the surfaces that have something truer to say — a
   * room that would not open is not a call anyone is in.
   */
  headline?: string;
  /** Overridden when there is no call to hang up from — see `GroupCall`. */
  hangUpLabel?: string;
  /**
   * Which call this is, for the transcript.
   *
   * Absent until the room opens — a call that never connected has
   * nothing to transcribe — and absent entirely from surfaces that have
   * no transcript, which is how this stays optional.
   */
  call?: TranscriptionCall | null;
  /**
   * Controls a surface adds to the bar — adding somebody to a direct
   * call, say. Rendered beside the shell's own at full size and hidden
   * while parked, where only the microphone and the way out fit.
   */
  actions?: React.ReactNode;
  onHangUp: () => void;
  /** The room, or whatever stands in for it while it opens. */
  children: React.ReactNode;
}

export function CallShell({
  title,
  headline,
  hangUpLabel = "Hang up",
  call = null,
  actions = null,
  onHangUp,
  children,
}: CallShellProps) {
  const { frame, minimized, minimize, expand, noteTranscript } = useCall();
  const [micOn, setMicOn] = useState(true);

  useCallContinuity({ frame, title, onHangUp });

  /* The transcript lives here rather than in the three surfaces because
     this is the one component all of them wrap themselves in, and it
     unmounts exactly when the call ends however the call ended. */
  const transcription = useTranscription(call);

  /* Mirrored where the unmount cleanup can reach it. A call that reached
     `recording` produced something worth handing over — even if nobody
     said anything, because "nothing was captured" is itself worth
     seeing rather than silently discarding. */
  const producedRef = useRef<{ roomId: string; title: string } | null>(null);

  /* Keyed on the two strings rather than on `call`, which the surfaces
     rebuild every render — an effect that depends on the object would
     re-run on every keystroke elsewhere in the app. */
  const roomId = call?.roomId ?? null;
  const callTitle = call?.title ?? "";

  /* Who came in, who left, what was said in the chat — for the corner
     and for a tab in the background, where the provider's own panels
     cannot be seen. Lives here for the same reason the transcript does:
     every surface wraps itself in this shell. */
  const notices = useRoomNotices({ frame, roomId, title });

  useEffect(() => {
    if (transcription.status !== "recording" || !roomId) return;
    producedRef.current = { roomId, title: callTitle };
  }, [transcription.status, roomId, callTitle]);

  useEffect(() => {
    return () => {
      if (producedRef.current) noteTranscript(producedRef.current);
    };
  }, [noteTranscript]);

  /* Read from the provider rather than tracked here. The microphone can
     be turned off from inside the room's own controls too, and a button
     that disagrees with the thing it controls is worse than no button. */
  useEffect(() => {
    if (!frame) return;

    const sync = () => {
      try {
        setMicOn(frame.localAudio());
      } catch {
        /* Asked after the room closed. The button is about to go. */
      }
    };

    sync();
    frame.on("participant-updated", sync);
    return () => {
      frame.off("participant-updated", sync);
    };
  }, [frame]);

  const { tileRef, offset, dragHandlers } = useDraggableTile(minimized);

  const toggleMic = useCallback(() => {
    if (!frame) return;
    try {
      frame.setLocalAudio(!frame.localAudio());
    } catch {
      /* A room that will not take the instruction is not a reason to
         end the call; the provider's own control still works. */
    }
  }, [frame]);

  return (
    <div
      ref={tileRef}
      /* A transform rather than new top/left classes, so dragging touches
         one inline style and never the DOM the room lives in. */
      style={minimized ? { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` } : undefined}
      className={cn(
        "fixed z-[60] flex flex-col",
        minimized
          ? "bottom-4 right-4 h-[184px] w-[248px] overflow-hidden rounded-2xl border border-line/[0.08] bg-surface-container/95 shadow-overlay backdrop-blur-2xl sm:h-[208px] sm:w-[288px]"
          : "inset-0 bg-base/95 p-4 backdrop-blur-xl"
      )}
    >
      <div
        {...(minimized ? dragHandlers : {})}
        className={cn(
          "flex shrink-0 items-center justify-between gap-2",
          minimized ? "cursor-grab touch-none select-none px-3 pb-2 pt-2.5 active:cursor-grabbing" : "mb-3"
        )}
      >
        <p className="truncate text-[12px] text-ink-dim">
          {minimized ? title : (headline ?? `In a call — ${title}`)}
        </p>

        <div className="flex shrink-0 items-center gap-1.5">
          {!minimized && actions}

          {/* Asking for a transcript, and the sign that one is being
              taken — visible to everyone in the room, including whoever
              declined. See `transcript-control`. Only once there is a
              call to transcribe: before the room opens, and in surfaces
              that carry no transcript, the button would sit there and
              do nothing when pressed. */}
          {call && <TranscriptControl state={transcription} minimized={minimized} />}

          {/* Only while parked. At full size the room paints its own,
              and two microphone buttons on one screen is a question
              about which one is real. */}
          {minimized && frame && (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg border border-line/[0.06] transition-colors",
                micOn
                  ? "bg-surface-control text-ink hover:bg-surface-raised"
                  : "bg-orbit-red/90 text-white hover:opacity-90"
              )}
            >
              {micOn ? (
                <Mic className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <MicOff className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={minimized ? expand : minimize}
            aria-label={minimized ? "Expand call" : "Minimize call"}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-line/[0.06] bg-surface-control text-ink transition-colors hover:bg-surface-raised"
          >
            {minimized ? (
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Minimize2 className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>

          <button
            type="button"
            onClick={onHangUp}
            aria-label={hangUpLabel}
            className={cn(
              "flex items-center gap-2 rounded-lg bg-orbit-red/90 font-medium tracking-wide text-white transition-opacity hover:opacity-90",
              minimized ? "h-7 w-7 justify-center" : "px-3 py-1.5 text-[11px]"
            )}
          >
            <PhoneOff className="h-3.5 w-3.5" aria-hidden />
            {!minimized && hangUpLabel}
          </button>
        </div>
      </div>

      {/* One child position, always. A sibling that appears and
          disappears ABOVE the room would shift the slot below it, and
          React reconciles these children by position — see the note at
          the top for what re-parenting the iframe costs. So this always
          renders and decides for itself whether it has anything to say. */}
      <TranscriptNotice state={transcription} minimized={minimized} />

      {/* The slot the room lives in for the whole call. Its position in
          this tree never changes — see the note at the top. */}
      <div className={cn("min-h-0 flex-1", minimized && "px-2 pb-2")}>
        {children}
      </div>

      {/* After the slot, and absolutely positioned — a sibling that came
          and went above it would move the room. See `room-notices`. */}
      <RoomNotices notices={notices} minimized={minimized} />

      <TranscriptConsentDialog state={transcription} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dragging the parked tile                                           */
/*                                                                     */
/*  The tile is anchored bottom-right and moved with a transform, so   */
/*  the offset is always zero or negative. It is clamped to the        */
/*  viewport on every move and on every resize — a window that shrinks */
/*  under the tile must not strand it, and its hang-up button with it, */
/*  off screen. Pointer capture keeps the drag alive when the pointer  */
/*  crosses the room's iframe, which would otherwise swallow it.       */
/* ------------------------------------------------------------------ */

/** The tile's resting gap from the viewport edge: Tailwind's 4. */
const EDGE = 16;

interface Offset {
  x: number;
  y: number;
}

function useDraggableTile(minimized: boolean) {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; startX: number; startY: number; from: Offset } | null>(null);

  const clamp = useCallback((next: Offset): Offset => {
    const tile = tileRef.current;
    if (!tile) return next;
    const maxLeft = Math.max(0, window.innerWidth - tile.offsetWidth - EDGE * 2);
    const maxUp = Math.max(0, window.innerHeight - tile.offsetHeight - EDGE * 2);
    return {
      x: Math.min(0, Math.max(-maxLeft, next.x)),
      y: Math.min(0, Math.max(-maxUp, next.y)),
    };
  }, []);

  useEffect(() => {
    if (!minimized) return;
    const reclamp = () => setOffset((current) => clamp(current));
    reclamp();
    window.addEventListener("resize", reclamp);
    return () => window.removeEventListener("resize", reclamp);
  }, [minimized, clamp]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // The buttons in the header are buttons, not handles.
      if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, from: offset };
    },
    [offset]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      setOffset(
        clamp({
          x: current.from.x + event.clientX - current.startX,
          y: current.from.y + event.clientY - current.startY,
        })
      );
    },
    [clamp]
  );

  const onPointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return {
    tileRef,
    offset,
    dragHandlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
  };
}
