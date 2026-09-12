"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useCall } from "@/contexts/call-context";
import { usePreferences } from "@/hooks/use-preferences";
import { installAudioPrimer } from "@/lib/audio/context";
import { startIncomingRing } from "@/lib/calls/ringtone";
import {
  notificationAccess,
  shouldNotify,
  showDesktopNotification,
} from "@/lib/notifications/desktop";
import { subscribeToCall, subscribeToIncomingCalls } from "@/lib/queries/calls";
import { listNames, othersInCall } from "@/lib/calls/party";
import {
  answerCallAction,
  declineCallAction,
  endCallAction,
} from "@/app/actions/calls";
import { AddToCall } from "@/components/calls/add-to-call";
import { CallRoom } from "@/components/calls/call-room";
import { CallShell } from "@/components/calls/call-shell";
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
/*  THE SOUND IS OWNED BY AN EFFECT, not by the handlers. Answering,   */
/*  declining, the ring expiring, signing out and unmounting all end   */
/*  in the same cleanup, so none of them has to remember to stop the   */
/*  ringtone and none of them can forget — which is the failure that   */
/*  leaves a phone ringing over a live call.                           */
/*                                                                     */
/*  The ring is NOT trusted to expire itself. The document carries     */
/*  `ringingExpiresAt` and the server refuses a late answer, so what   */
/*  this timer does is stop showing a card nobody can act on — a       */
/*  cosmetic job, deliberately, because a client clock is not          */
/*  something authorization should rest on.                            */
/* ------------------------------------------------------------------ */

export function IncomingCall() {
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const { joinScheduledCall } = useCall();
  const [ringing, setRinging] = useState<OrbitCall | null>(null);
  const [grant, setGrant] = useState<CallGrant | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  /* Kept because the ring it came from is cleared on answer, and a
     parked call in the corner has to say whose voice it is. Everyone
     else in the room, as names — updated as people are added or leave. */
  const [activeWith, setActiveWith] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uid = user?.id ?? null;
  const orgId = user?.orgId ?? null;

  const ringingId = ringing?.id ?? null;
  const inRoom = Boolean(grant);

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

  /* Follow the call once in it, so the bar keeps naming who is actually
     there as people are rung in and hang up. */
  useEffect(() => {
    if (!activeCallId || !uid) return;
    return subscribeToCall(activeCallId, (call) => {
      if (!call || call.status !== "active") return;
      const others = othersInCall(call, uid);
      if (others.length > 0) setActiveWith(others);
    });
  }, [activeCallId, uid]);

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

  /* A call arrives without a gesture, which is exactly what a browser
     will not start audio for. Arming the session's first click here —
     rather than relying on the message notifier having been mounted —
     is what makes this component able to ring on its own. */
  useEffect(() => {
    installAudioPrimer();
  }, []);

  /* Ring. Keyed on the id rather than the document, because a snapshot
     that changes nothing we care about would otherwise restart the
     ringtone from the top on every write. */
  useEffect(() => {
    if (!ringingId || inRoom || !preferences.callSounds) return;
    return startIncomingRing();
  }, [ringingId, inRoom, preferences.callSounds]);

  /* The same shape as the ringtone above, deliberately, and owned by an
     effect for the identical reason: answering, declining, the ring
     expiring and this component unmounting all end in one cleanup, so
     nothing has to remember to withdraw the notification and nothing
     can forget. A desktop card does not expire on its own, so a card
     left behind would go on offering a call that ended.

     Only raised when OrbitOS is not the window being looked at. The
     card is already on screen for anyone watching this tab, and a
     notification duplicating it is how people learn to dismiss these
     without reading them. */
  useEffect(() => {
    if (!ringing || inRoom) return;

    if (
      !shouldNotify({
        access: notificationAccess(),
        enabled: preferences.desktopNotifications,
        visible: document.visibilityState === "visible",
      })
    ) {
      return;
    }

    return showDesktopNotification({
      title: ringing.joinsCallId || ringing.joinsEventId
        ? `${ringing.fromName} is adding you to a call`
        : `${ringing.fromName} is calling`,
      body: "Answer in OrbitOS.",
      /* Shared with the push payload in `lib/notifications/push-sender`,
         so a device that receives both shows one card rather than two. */
      tag: `orbit-call-${ringing.id}`,
    });
  }, [ringing, inRoom, preferences.desktopNotifications]);

  const answer = useCallback(async () => {
    if (!ringing) return;

    setBusy(true);
    setError(null);

    const result = await answerCallAction(ringing.id);
    if (!result.success) {
      setError(result.error);
      setBusy(false);
      return;
    }

    if (result.kind === "scheduled") {
      /* Added to a scheduled call. The room belongs to the scheduled-call
         surface, which knows how that kind of call ends; this phone only
         had to ring. */
      setRinging(null);
      joinScheduledCall(result.roomId, result.title);
      setBusy(false);
      return;
    }

    /* The call to watch and hang up from is the one the server names:
       for a ring that added them to a running call, that is the call,
       not the ring. */
    setActiveCallId(result.callId);
    setActiveWith(result.withNames.length > 0 ? result.withNames : [ringing.fromName]);
    setGrant(result.grant);
    setRinging(null);
    setBusy(false);
  }, [ringing, joinScheduledCall]);

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
    setActiveWith([]);
    if (id) await endCallAction(id);
  }, [activeCallId]);

  if (grant) {
    const withNames = listNames(activeWith);
    return (
      <CallShell
        title={withNames || "Call"}
        headline={withNames ? `In a call with ${withNames}` : "In a call"}
        call={
          activeCallId
            ? {
                roomId: grant.roomId,
                callKind: "direct",
                callId: activeCallId,
                title: withNames ? `Call with ${withNames}` : "Call",
              }
            : null
        }
        actions={activeCallId ? <AddToCall target={{ callId: activeCallId }} /> : null}
        onHangUp={hangUp}
      >
        <CallRoom grant={grant} onLeave={hangUp} className="h-full w-full" />
      </CallShell>
    );
  }

  if (!ringing) return null;

  /* A ring that adds them to a call already running says so: "Ada is
     calling" and "Ada is adding you to a call" are different requests,
     and the second is the one people want to know about before they
     pick up. */
  const addingIn = Boolean(ringing.joinsCallId || ringing.joinsEventId);

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={
        addingIn
          ? `${ringing.fromName} is adding you to a call`
          : `Incoming call from ${ringing.fromName}`
      }
      className="fixed bottom-6 right-6 z-[60] w-[300px] animate-fade-in rounded-2xl border border-line/[0.08] bg-surface-container/95 p-5 shadow-overlay backdrop-blur-2xl"
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orbit-green opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-orbit-green" />
        </span>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
          {addingIn ? "Join a call" : "Incoming call"}
        </p>
      </div>

      <div className="mb-5 flex items-center gap-3">
        <UserAvatar name={ringing.fromName} size="sm" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-medium tracking-tight text-ink">
            {ringing.fromName}
          </span>
          {addingIn && (
            <span className="text-[11px] font-light text-ink-dim">
              is adding you to a call in progress
            </span>
          )}
        </div>
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
