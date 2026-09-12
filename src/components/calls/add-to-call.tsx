"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { addToCallAction } from "@/app/actions/calls";
import { subscribeToCall, subscribeToOutgoingCalls } from "@/lib/queries/calls";
import { subscribeToEvent } from "@/lib/queries/events";
import { subscribeToMembersByOrg } from "@/lib/queries/members";
import { callParticipants } from "@/lib/calls/party";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils/classnames";
import type { Member } from "@/types/member";
import type { OrbitCall } from "@/types/call";

/* ------------------------------------------------------------------ */
/*  Add to call                                                        */
/*                                                                     */
/*  The control in a call's bar that rings a teammate into it. One     */
/*  button, one list: everyone in the workspace who is not already in  */
/*  the room, with the ones still being rung marked as such.           */
/*                                                                     */
/*  It watches the call — the `calls` document for a direct call, the  */
/*  engagement for a scheduled one — rather than being told who is in  */
/*  it, because the answer changes under it: the person just added     */
/*  answers, somebody else hangs up. A list built once at mount would  */
/*  offer to add people who are already there. The pending rings come  */
/*  off the same outgoing-calls listener the caller's phone uses,      */
/*  filtered to this call, so nothing new is being read.               */
/* ------------------------------------------------------------------ */

/** Which call: a direct call by its document, or a scheduled call by its engagement. */
export type AddToCallTarget = { callId: string; eventId?: never } | { eventId: string; callId?: never };

interface AddToCallProps {
  target: AddToCallTarget;
}

export function AddToCall({ target }: AddToCallProps) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const orgId = user?.orgId ?? null;
  const { callId, eventId } = target;

  const [open, setOpen] = useState(false);
  /* Whether the call is running, and who is in it — read the same way
     from either source. */
  const [live, setLive] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<OrbitCall[]>([]);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (callId) {
      return subscribeToCall(callId, (call) => {
        setLive(call?.status === "active");
        setParticipants(call ? callParticipants(call) : []);
      });
    }
    if (eventId) {
      return subscribeToEvent(eventId, (event) => {
        setLive(Boolean(event) && event!.status !== "cancelled");
        setParticipants(event ? [...(event.attendees ?? []), ...(event.guests ?? [])] : []);
      });
    }
  }, [callId, eventId]);

  /* The directory and the outgoing rings are only worth paying for
     while the list is open. */
  useEffect(() => {
    if (!open || !orgId || !uid) return;
    const stopMembers = subscribeToMembersByOrg(orgId, setMembers);
    const stopRings = subscribeToOutgoingCalls(uid, orgId, (calls) =>
      setPending(
        calls.filter((c) =>
          callId ? c.joinsCallId === callId : c.joinsEventId === eventId
        )
      )
    );
    return () => {
      stopMembers();
      stopRings();
    };
  }, [open, orgId, uid, callId, eventId]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const inCall = useMemo(() => new Set(participants), [participants]);
  const ringing = useMemo(() => new Set(pending.map((c) => c.to)), [pending]);

  const candidates = useMemo(
    () =>
      members
        .filter((m) => m.id !== uid && !inCall.has(m.id))
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [members, uid, inCall]
  );

  const add = async (member: Member) => {
    setBusyUid(member.id);
    setError(null);
    const result = await addToCallAction(
      callId ? { callId, targetUid: member.id } : { eventId, targetUid: member.id }
    );
    if (!result.success) setError(result.error);
    setBusyUid(null);
  };

  /* Only while the call is running. A ring that has not been answered
     has nobody to add anyone to yet. */
  if (!live) return null;

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Add somebody to this call"
        aria-expanded={open}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-lg border border-line/[0.06] px-2.5 font-mono text-[9px] uppercase tracking-[0.2em] transition-colors",
          open
            ? "bg-surface-raised text-ink"
            : "bg-surface-control text-ink hover:bg-surface-raised"
        )}
      >
        <UserPlus className="h-3.5 w-3.5" aria-hidden />
        Add
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Add somebody to this call"
          /* Anchored to the button where there is room for it; on a
             narrow screen the button sits near the left edge and a
             right-anchored panel hangs off it, so the panel takes the
             width instead. */
          className="fixed inset-x-4 top-16 z-10 animate-fade-in rounded-2xl border border-line/[0.08] bg-surface-container/95 p-3 shadow-overlay backdrop-blur-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-9 sm:w-[280px]"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
              Add to call
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-md p-1 text-ink-dim transition-colors hover:text-ink"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </div>

          {candidates.length === 0 ? (
            <p className="px-1 py-2 text-[12px] font-light text-ink-dim">
              {members.length === 0 ? "Loading…" : "Everyone is already in this call."}
            </p>
          ) : (
            <ul className="max-h-[240px] space-y-0.5 overflow-y-auto">
              {candidates.map((member) => {
                const isRinging = ringing.has(member.id);
                const isBusy = busyUid === member.id;
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => add(member)}
                      disabled={isRinging || isBusy || busyUid !== null}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-raised disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <UserAvatar name={member.name} photoURL={member.photoURL} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-light text-ink">
                        {member.name}
                      </span>
                      {(isRinging || isBusy) && (
                        <span className="flex shrink-0 items-center gap-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-dim">
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                          Ringing
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error && <p className="mt-2 px-1 text-[11px] font-light text-orbit-red">{error}</p>}
        </div>
      )}
    </div>
  );
}
