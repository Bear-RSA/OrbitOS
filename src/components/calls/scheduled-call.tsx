"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { joinScheduledCallAction } from "@/app/actions/calls";
import { AddToCall } from "@/components/calls/add-to-call";
import { CallLobbyNotice, useLobbyRetry } from "@/components/calls/call-lobby";
import { CallRoom } from "@/components/calls/call-room";
import { CallShell } from "@/components/calls/call-shell";
import { Loader } from "@/components/ui/loader";
import type { CallGrant, CallLobby } from "@/types/call";

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
  /* Set while waiting for the room to open or for the organizer. */
  const [lobby, setLobby] = useState<CallLobby | null>(null);
  const mounted = useRef(true);

  const join = useCallback(() => {
    joinScheduledCallAction(roomId).then((result) => {
      if (!mounted.current) return;

      if (result.success) {
        setLobby(null);
        setGrant(result.grant);
        setTitle(result.title);
        setEventId(result.eventId);
      } else if (result.lobby) {
        setLobby(result.lobby);
      } else {
        setLobby(null);
        setError(result.error);
      }
    });
  }, [roomId]);

  /* The first attempt happens once, when this mounts, and mounting IS
     the click. Later attempts are the lobby asking again. */
  useEffect(() => {
    mounted.current = true;
    join();
    return () => {
      mounted.current = false;
    };
  }, [join]);

  useLobbyRetry(lobby, join);

  return (
    <CallShell
      title={title}
      headline={error ? "Call unavailable" : lobby ? "Waiting to start" : undefined}
      hangUpLabel={error ? "Close" : "Hang up"}
      actions={grant && eventId ? <AddToCall target={{ eventId }} /> : null}
      onHangUp={onClose}
    >
      {grant ? (
        <CallRoom grant={grant} onLeave={onClose} className="h-full w-full" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl bg-surface-card">
          {lobby ? (
            <CallLobbyNotice lobby={lobby} />
          ) : error ? (
            <p className="max-w-sm px-6 text-center text-[13px] font-light leading-relaxed text-orbit-red">
              {error}
            </p>
          ) : (
            <>
              <Loader />
              <span className="text-[12px] text-ink-dim">
                Opening the room
              </span>
            </>
          )}
        </div>
      )}
    </CallShell>
  );
}
