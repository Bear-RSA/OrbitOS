"use client";

import { useEffect, useState } from "react";
import { joinScheduledCallAction } from "@/app/actions/calls";
import { AddToCall } from "@/components/calls/add-to-call";
import { CallRoom } from "@/components/calls/call-room";
import { CallShell } from "@/components/calls/call-shell";
import { Loader } from "@/components/ui/loader";
import type { CallGrant } from "@/types/call";

/* ------------------------------------------------------------------ */
/*  Scheduled call                                                     */
/*                                                                     */
/*  A member's seat in an engagement's room. Mounted by `CallHost`     */
/*  when somebody clicks Join — from the calendar, the dashboard, or   */
/*  the link in their invitation — and unmounted when they hang up, so */
/*  the room outlasts whichever page it was opened from. See           */
/*  `contexts/call-context`.                                           */
/*                                                                     */
/*  Nothing here has to be undone on the way out. A group call keeps a */
/*  participant list on its thread and has to take you off it; a       */
/*  scheduled call's list is the invitation, and the room's own clock  */
/*  is what closes it. Leaving is just leaving.                        */
/* ------------------------------------------------------------------ */

interface ScheduledCallProps {
  roomId: string;
  /** What the caller knew to call it. Replaced once the server answers. */
  title: string;
  onClose: () => void;
}

export function ScheduledCall({ roomId, title: initialTitle, onClose }: ScheduledCallProps) {
  const [grant, setGrant] = useState<CallGrant | null>(null);
  const [title, setTitle] = useState(initialTitle);
  /* The engagement behind the room, once the server has said which —
     what ringing a colleague in adds them to. */
  const [eventId, setEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Joining is not in a callback: it happens once, when this mounts,
     and mounting IS the click. */
  useEffect(() => {
    let cancelled = false;

    joinScheduledCallAction(roomId).then((result) => {
      if (cancelled) return;

      if (result.success) {
        setGrant(result.grant);
        setTitle(result.title);
        setEventId(result.eventId);
      } else {
        setError(result.error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  return (
    <CallShell
      title={title}
      headline={error ? "Call unavailable" : undefined}
      hangUpLabel={error ? "Close" : "Hang up"}
      actions={grant && eventId ? <AddToCall target={{ eventId }} /> : null}
      onHangUp={onClose}
    >
      {grant ? (
        <CallRoom grant={grant} onLeave={onClose} className="h-full w-full" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl bg-surface-card">
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
    </CallShell>
  );
}
