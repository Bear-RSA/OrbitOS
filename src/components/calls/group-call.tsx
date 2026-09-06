"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneOff } from "lucide-react";
import {
  leaveGroupCallAction,
  startGroupCallAction,
} from "@/app/actions/calls";
import { CallRoom } from "@/components/calls/call-room";
import { Loader } from "@/components/ui/loader";
import type { CallGrant } from "@/types/call";

/* ------------------------------------------------------------------ */
/*  Group call                                                         */
/*                                                                     */
/*  The room beside a group thread. Mounted when somebody starts or    */
/*  joins one and unmounted when they leave, so being in a call is one */
/*  piece of state on the Messages page rather than a flow spread      */
/*  across it — the same shape `OutgoingCall` has.                     */
/*                                                                     */
/*  There is no ringing half here, and no incoming half either. One    */
/*  action opens the room or walks into the open one, because from     */
/*  this side those are the same gesture: the button says Start when   */
/*  the thread is quiet and Join when it is not, and the server        */
/*  decides which of the two actually happened.                        */
/*                                                                     */
/*  LEAVING IS OWNED BY AN EFFECT, not by the button. Clicking Hang    */
/*  up, Daily's own leave button, closing the tab, navigating away and */
/*  signing out all end in the same cleanup, so none of them has to    */
/*  remember to take this person out of the participant list and none  */
/*  of them can forget — which is the failure that leaves a call lit   */
/*  in everyone's rail long after the room emptied.                    */
/* ------------------------------------------------------------------ */

interface GroupCallProps {
  conversationId: string;
  /** What the room is called, for the bar above it. */
  title: string;
  onClose: () => void;
}

export function GroupCall({ conversationId, title, onClose }: GroupCallProps) {
  const [grant, setGrant] = useState<CallGrant | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* The room outlives individual renders and has to be left on unmount,
     so what cleanup needs is mirrored where it can reach it. */
  const joinedRef = useRef(false);

  /* Opening the room is deliberately not in a callback: it happens
     once, when this component mounts, and mounting IS the click. */
  useEffect(() => {
    let cancelled = false;

    startGroupCallAction({ conversationId }).then((result) => {
      if (cancelled) return;

      if (result.success) {
        joinedRef.current = true;
        setGrant(result.grant);
      } else {
        setError(result.error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  /* The single place this person stops being in the room. Runs on
     unmount however the unmount was reached. */
  useEffect(() => {
    return () => {
      if (!joinedRef.current) return;
      joinedRef.current = false;
      void leaveGroupCallAction({ conversationId });
    };
  }, [conversationId]);

  /* A tab closed outright never unmounts anything, so the effect above
     never fires. This is the same goodbye, attempted on the way out.

     It often will not land — a request started as the page is torn down
     is the browser's to cancel — and that is why nothing rests on it.
     `expiresAt` is what actually ends a call; this only shortens the
     window in which a rail says somebody is in a room they have left. */
  useEffect(() => {
    const sayGoodbye = () => {
      if (!joinedRef.current) return;
      void leaveGroupCallAction({ conversationId });
    };

    window.addEventListener("pagehide", sayGoodbye);
    return () => window.removeEventListener("pagehide", sayGoodbye);
  }, [conversationId]);

  const hangUp = useCallback(() => {
    // The leave itself is the unmount effect's job — see above.
    onClose();
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-base/95 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="truncate font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
          {error ? "Call unavailable" : `In a call — ${title}`}
        </p>
        <button
          type="button"
          onClick={hangUp}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-orbit-red/90 px-3 py-1.5 text-[11px] font-medium tracking-wide text-white transition-opacity hover:opacity-90"
        >
          <PhoneOff className="h-3.5 w-3.5" aria-hidden />
          {error ? "Close" : "Hang up"}
        </button>
      </div>

      {grant ? (
        <CallRoom grant={grant} onLeave={hangUp} className="min-h-0 flex-1" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl bg-surface-card">
          {error ? (
            <p className="max-w-sm px-6 text-center text-[13px] font-light leading-relaxed text-orbit-red">
              {error}
            </p>
          ) : (
            <>
              <Loader />
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">
                Opening the room
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
