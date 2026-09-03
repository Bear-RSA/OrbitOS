"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { subscribeToIncomingCalls } from "@/lib/queries/calls";
import {
  answerCallAction,
  declineCallAction,
  endCallAction,
} from "@/app/actions/calls";
import { CallRoom } from "@/components/calls/call-room";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { CallGrant, OrbitCall } from "@/types/call";

/* ------------------------------------------------------------------ */
/*  Incoming call                                                      */
/*                                                                     */
/*  Mounted once, high in the tree, for the whole signed-in session:   */
/*  a phone that only rings on the page you happen to be looking at is */
/*  not a phone. It holds one listener — `to == me`, `status ==        */
/*  ringing` — which is the narrowest query in the app precisely       */
/*  because it is the one that never gets torn down.                   */
/*                                                                     */
/*  The ring is NOT trusted to expire itself. The document carries     */
/*  `ringingExpiresAt` and the server refuses a late answer, so what   */
/*  this timer does is stop showing a card nobody can act on — a       */
/*  cosmetic job, deliberately, because a client clock is not          */
/*  something authorization should rest on.                            */
/* ------------------------------------------------------------------ */

export function IncomingCall() {
  const { user } = useAuth();
  const [ringing, setRinging] = useState<OrbitCall | null>(null);
  const [grant, setGrant] = useState<CallGrant | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uid = user?.id ?? null;
  const orgId = user?.orgId ?? null;

  /* Held in a ref so the expiry timer can read the current ring without
     restarting itself every render. */
  const ringingRef = useRef<OrbitCall | null>(null);
  ringingRef.current = ringing;

  useEffect(() => {
    if (!uid || !orgId) return;

    return subscribeToIncomingCalls(uid, orgId, (calls) => {
      /* Newest wins. Two people ringing at once is rare and the
         alternative — a stack of cards — is worse than answering the
         most recent and letting the other time out. */
      setRinging(calls[0] ?? null);
    });
  }, [uid, orgId]);

  /* Stop showing a card the server would refuse anyway. */
  useEffect(() => {
    if (!ringing) return;

    const expiresIn = ringing.ringingExpiresAt.toMillis() - Date.now();
    if (expiresIn <= 0) {
      setRinging(null);
      return;
    }

    const timer = setTimeout(() => {
      if (ringingRef.current?.id === ringing.id) setRinging(null);
    }, expiresIn);

    return () => clearTimeout(timer);
  }, [ringing]);

  const answer = useCallback(async () => {
    if (!ringing) return;

    setBusy(true);
    setError(null);

    const result = await answerCallAction(ringing.id);
    if (result.success) {
      setActiveCallId(ringing.id);
      setGrant(result.grant);
      setRinging(null);
    } else {
      setError(result.error);
    }

    setBusy(false);
  }, [ringing]);

  const decline = useCallback(async () => {
    if (!ringing) return;

    setBusy(true);
    const id = ringing.id;
    setRinging(null);
    await declineCallAction(id);
    setBusy(false);
  }, [ringing]);

  const hangUp = useCallback(async () => {
    const id = activeCallId;
    setGrant(null);
    setActiveCallId(null);
    if (id) await endCallAction(id);
  }, [activeCallId]);

  if (grant) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-scrim/95 p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
            In a call
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

  if (!ringing) return null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={`Incoming call from ${ringing.fromName}`}
      className="fixed bottom-6 right-6 z-[60] w-[300px] animate-fade-in rounded-2xl border border-line/[0.08] bg-surface-container/95 p-5 shadow-overlay backdrop-blur-2xl"
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orbit-green opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-orbit-green" />
        </span>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
          Incoming call
        </p>
      </div>

      <div className="mb-5 flex items-center gap-3">
        <UserAvatar name={ringing.fromName} size="sm" />
        <span className="text-[14px] font-medium tracking-tight text-ink">
          {ringing.fromName}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={answer}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orbit-green px-3 py-2.5 text-[12px] font-medium tracking-wide text-white transition-opacity disabled:opacity-40"
        >
          <Phone className="h-3.5 w-3.5" aria-hidden />
          Answer
        </button>
        <button
          type="button"
          onClick={decline}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line/[0.06] bg-surface-control px-3 py-2.5 text-[12px] font-light tracking-wide text-ink transition-colors hover:bg-surface-raised disabled:opacity-40"
        >
          <PhoneOff className="h-3.5 w-3.5" aria-hidden />
          Decline
        </button>
      </div>

      {error && <p className="mt-3 text-[11px] font-light text-orbit-red">{error}</p>}
    </div>
  );
}
