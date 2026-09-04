"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneOff } from "lucide-react";
import { subscribeToCall } from "@/lib/queries/calls";
import {
  endCallAction,
  getDirectCallGrantAction,
  markCallMissedAction,
  startCallAction,
} from "@/app/actions/calls";
import { CallRoom } from "@/components/calls/call-room";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { CallGrant, CallStatus } from "@/types/call";

/* ------------------------------------------------------------------ */
/*  Outgoing call                                                      */
/*                                                                     */
/*  The caller's half of a ring. Mounted when somebody clicks Call and */
/*  unmounted when the call is over, so placing a call is one piece of */
/*  state in the Personnel Network rather than a flow spread across    */
/*  it.                                                                */
/*                                                                     */
/*  It watches the single call document rather than a query of ringing */
/*  calls, because the transition it exists to catch — the callee      */
/*  answering — is exactly the one that removes the row from any       */
/*  `status == ringing` query.                                         */
/* ------------------------------------------------------------------ */

interface OutgoingCallProps {
  target: { uid: string; name: string; photoURL?: string | null };
  onClose: () => void;
}

const ENDED: Record<string, string> = {
  declined: "declined the call",
  missed: "did not answer",
  ended: "left the call",
};

export function OutgoingCall({ target, onClose }: OutgoingCallProps) {
  const [callId, setCallId] = useState<string | null>(null);
  const [status, setStatus] = useState<CallStatus | "placing">("placing");
  const [grant, setGrant] = useState<CallGrant | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* The call outlives individual renders and has to be hung up on
     unmount, so its id is mirrored where cleanup can reach it. */
  const callIdRef = useRef<string | null>(null);
  callIdRef.current = callId;

  /* Placing the call is deliberately not in a callback: it happens once,
     when this component mounts, and mounting IS the click. */
  useEffect(() => {
    let cancelled = false;

    startCallAction({ targetUid: target.uid }).then((result) => {
      if (cancelled) return;

      if (result.success) {
        setCallId(result.callId);
        setStatus("ringing");
      } else {
        setError(result.error);
        setStatus("ended");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [target.uid]);

  /* Follow the call to whatever it becomes. */
  useEffect(() => {
    if (!callId) return;

    return subscribeToCall(callId, (call) => {
      if (!call) return;
      setStatus(call.status);
    });
  }, [callId]);

  /* Picked up — get into the room. Runs off the status transition rather
     than off the answer itself, because the caller learns about it from
     the document, not from the callee. */
  useEffect(() => {
    if (status !== "active" || !callId || grant) return;

    let cancelled = false;

    getDirectCallGrantAction(callId).then((result) => {
      if (cancelled) return;
      if (result.success) setGrant(result.grant);
      else setError(result.error);
    });

    return () => {
      cancelled = true;
    };
  }, [status, callId, grant]);

  /* Nobody picked up. Marking it missed is a tidy-up — the server
     already refuses a late answer — so a failure here is ignored. */
  useEffect(() => {
    if (status !== "ringing" || !callId) return;

    const timer = setTimeout(() => {
      void markCallMissedAction(callId);
    }, 45_000);

    return () => clearTimeout(timer);
  }, [status, callId]);

  const hangUp = useCallback(async () => {
    const id = callIdRef.current;
    onClose();
    if (id) await endCallAction(id);
  }, [onClose]);

  if (grant) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-base/95 p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
            In a call with {target.name}
          </p>
          <button
            type="button"
            onClick={hangUp}
            className="flex items-center gap-2 rounded-lg bg-orbit-red/90 px-3 py-1.5 text-[11px] font-medium tracking-wide text-white transition-opacity hover:opacity-90"
          >
            <PhoneOff className="h-3.5 w-3.5" aria-hidden />
            Hang up
          </button>
        </div>
        <CallRoom grant={grant} onLeave={hangUp} className="min-h-0 flex-1" />
      </div>
    );
  }

  const over = status === "declined" || status === "missed" || status === "ended";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-[60] w-[300px] animate-fade-in rounded-2xl border border-line/[0.08] bg-surface-container/95 p-5 shadow-overlay backdrop-blur-2xl"
    >
      <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
        {status === "placing" && "Connecting"}
        {status === "ringing" && "Ringing"}
        {status === "active" && "Joining"}
        {over && "Call ended"}
      </p>

      <div className="mb-5 flex items-center gap-3">
        <UserAvatar name={target.name} photoURL={target.photoURL} size="sm" />
        <div className="flex flex-col">
          <span className="text-[14px] font-medium tracking-tight text-ink">
            {target.name}
          </span>
          {over && (
            <span className="text-[11px] font-light text-ink-dim">
              {error ?? `${target.name} ${ENDED[status] ?? "is unavailable"}`}
            </span>
          )}
        </div>
      </div>

      {error && !over && (
        <p className="mb-4 text-[11px] font-light text-orbit-red">{error}</p>
      )}

      <button
        type="button"
        onClick={over ? onClose : hangUp}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-line/[0.06] bg-surface-control px-3 py-2.5 text-[12px] font-light tracking-wide text-ink transition-colors hover:bg-surface-raised"
      >
        {!over && <PhoneOff className="h-3.5 w-3.5" aria-hidden />}
        {over ? "Close" : "Cancel"}
      </button>
    </div>
  );
}
