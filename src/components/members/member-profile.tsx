"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarClock, MessageSquare, Phone } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/user-avatar";
import { OutgoingCall } from "@/components/calls/outgoing-call";
import { getTasksByOrg } from "@/lib/queries/tasks";
import { getEventsInRange } from "@/lib/queries/events";
import { sharedEngagements, workloadFor } from "@/lib/members/profile";
import { engagementPresenceByMember } from "@/lib/calendar/presence";
import { cn } from "@/lib/utils/classnames";
import type { Member } from "@/types/member";
import type { OrbitEvent } from "@/types/event";
import type { Task } from "@/types/task";
import type { Conversation } from "@/types/message";

/* ------------------------------------------------------------------ */
/*  Member profile                                                     */
/*                                                                     */
/*  One read-only card for "who is this person", opened from anywhere  */
/*  a face or a name appears. `ProfileModal` is the editable view of   */
/*  YOUR OWN account and stays separate — the two answer different     */
/*  questions, and merging them would put a Save button on somebody    */
/*  else's record.                                                     */
/*                                                                     */
/*  It hosts the ring itself rather than raising an `onCall` to four   */
/*  different callers. `OutgoingCall` has to outlive the dialog — a    */
/*  call that hangs up because a card closed is not a call — so the    */
/*  dialog closes and the ring keeps its own mount here.               */
/*                                                                     */
/*  Everything shown is already readable by any member of the org:     */
/*  the user doc, org-wide `events`, org-wide `tasks`, and the dm the  */
/*  viewer is themselves a participant in. Nothing here widens what    */
/*  one member can see of another.                                     */
/* ------------------------------------------------------------------ */

/** How far back to look for engagements the two people shared. */
const HISTORY_DAYS = 90;

interface MemberProfileProps {
  /** The person to show. `null` closes the card. */
  member: Member | null;
  onClose: () => void;
  viewer: { id: string; orgId: string };
  /** Opens the dm with this person. Omitted when already in it. */
  onMessage?: (uid: string) => void;
  /** Passed when the caller already holds them, to save the read. */
  tasks?: Task[];
  events?: OrbitEvent[];
  /**
   * The dm between the viewer and this person, when the caller already
   * has it in hand.
   *
   * Deliberately a prop rather than a read of its own. A conversation
   * that does not exist yet cannot be read at all — the rule dereferences
   * `resource.data.orgId`, which is null for a missing document, so the
   * get is denied rather than returning empty. Fetching it here would
   * mean a permission error in the console every time somebody opens the
   * card of a colleague they have never messaged, which is the common
   * case and would bury real errors.
   */
  dm?: Conversation | null;
}

export function MemberProfile({
  member,
  onClose,
  viewer,
  onMessage,
  tasks: providedTasks,
  events: providedEvents,
  dm = null,
}: MemberProfileProps) {
  const [tasks, setTasks] = useState<Task[]>(providedTasks ?? []);
  const [events, setEvents] = useState<OrbitEvent[]>(providedEvents ?? []);
  const [calling, setCalling] = useState<{
    uid: string;
    name: string;
    photoURL?: string | null;
  } | null>(null);

  const memberId = member?.id ?? null;
  const isSelf = memberId === viewer.id;

  /* Fetched on open, not on mount, and only when the caller did not
     already have them. The dashboard holds both; Messages holds
     neither, and opening one card is not a reason to put two more
     listeners on that page for the whole session. */
  useEffect(() => {
    if (!memberId || providedTasks) return;

    let cancelled = false;
    getTasksByOrg(viewer.orgId)
      .then((rows) => !cancelled && setTasks(rows))
      .catch((err) => console.error("[MemberProfile] Tasks unavailable:", err));

    return () => {
      cancelled = true;
    };
  }, [memberId, providedTasks, viewer.orgId]);

  useEffect(() => {
    if (!memberId || providedEvents) return;

    let cancelled = false;
    const now = new Date();
    const from = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);

    /* Reuses the (orgId, startAt) composite index the calendar already
       relies on — no new index for this card. */
    getEventsInRange(viewer.orgId, from, now)
      .then((rows) => !cancelled && setEvents(rows))
      .catch((err) => console.error("[MemberProfile] Engagements unavailable:", err));

    return () => {
      cancelled = true;
    };
  }, [memberId, providedEvents, viewer.orgId]);

  const workload = useMemo(
    () => (memberId ? workloadFor(tasks, memberId) : { open: 0, loadPercent: 0 }),
    [tasks, memberId]
  );

  const shared = useMemo(
    () => (memberId ? sharedEngagements(events, viewer.id, memberId) : []),
    [events, viewer.id, memberId]
  );

  /* A live engagement outranks a self-set status, the same bargain the
     Personnel Network makes: somebody who clicked "available" an hour
     ago and is in a client call right now is not available. */
  const presence = useMemo(() => {
    if (!member) return null;
    const map = engagementPresenceByMember(events, [member.id], {
      [member.id]: member.name,
    });
    return map[member.id] ?? null;
  }, [events, member]);

  if (!member) {
    return calling ? (
      <OutgoingCall target={calling} onClose={() => setCalling(null)} />
    ) : null;
  }

  const status = presence ? presence.label : (member.operationalStatus ?? "available");
  const statusTone = presence
    ? "bg-orbit-amber"
    : member.operationalStatus === "offline"
      ? "bg-orbit-red"
      : member.operationalStatus === "focused"
        ? "bg-ink"
        : "bg-orbit-green";

  const descriptor =
    member.roleDescriptor || (member.role === "OWNER" ? "Owner" : "Member");

  /* Calling yourself is not a thing, and someone already in a meeting is
     reachable but probably should not be rung — so the button stays,
     disabled, and says why. Same philosophy as the Personnel Network. */
  const callBlocked =
    isSelf || Boolean(presence) || member.operationalStatus === "offline";
  const callReason = isSelf
    ? "This is you"
    : presence
      ? `${member.name} is ${presence.label}`
      : member.operationalStatus === "offline"
        ? `${member.name} is offline`
        : `Call ${member.name}`;

  return (
    <>
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="sm:max-w-md" id="member-profile">
          {/* ── Banner ─────────────────────────────────────────── */}
          <div className="-mx-6 -mt-6 mb-5 border-b border-line/[0.05] bg-surface-control/50 px-6 pb-5 pt-6">
            <div className="flex items-start gap-4">
              <UserAvatar size="xl" name={member.name} photoURL={member.photoURL} />

              <div className="min-w-0 flex-1 pt-1">
                <DialogTitle className="truncate text-[18px] font-medium tracking-tight text-ink-strong">
                  {member.name}
                </DialogTitle>
                <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                  {descriptor}
                </p>
                <p className="mt-2 flex items-center gap-2 text-[11px] text-ink-muted">
                  <span className={cn("h-1.5 w-1.5 rounded-full", statusTone)} />
                  <span className="capitalize">{status}</span>
                </p>
              </div>
            </div>
          </div>

          {/* ── Actions ────────────────────────────────────────── */}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={callBlocked}
              title={callReason}
              onClick={() => {
                setCalling({
                  uid: member.id,
                  name: member.name,
                  photoURL: member.photoURL,
                });
                onClose();
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-surface-control px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.15em] text-ink ring-1 ring-inset ring-line/[0.08] transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              Call
            </button>

            {onMessage && !isSelf && (
              <button
                type="button"
                onClick={() => {
                  onMessage(member.id);
                  onClose();
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.15em] text-on-ink transition-transform duration-300 hover:-translate-y-px"
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                Message
              </button>
            )}
          </div>

          {/* ── Bio ────────────────────────────────────────────── */}
          {(member as { bio?: string }).bio && (
            <p className="mt-5 text-[12px] leading-relaxed text-ink-muted">
              {(member as { bio?: string }).bio}
            </p>
          )}

          {/* ── Workload ───────────────────────────────────────── */}
          <Section label="Current load">
            <div className="flex items-center gap-3">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-control">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    workload.loadPercent >= 80 ? "bg-orbit-red" : "bg-ink"
                  )}
                  style={{ width: `${workload.loadPercent}%` }}
                />
              </div>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-muted">
                {workload.open} open
              </span>
            </div>
          </Section>

          {/* ── Shared history ─────────────────────────────────── */}
          {!isSelf && (
            <Section label="Between you">
              {dm?.lastMessagePreview ? (
                <p className="truncate text-[12px] text-ink-muted">
                  <span className="text-ink-dim">Last message · </span>
                  {dm.lastMessagePreview}
                </p>
              ) : (
                <p className="text-[12px] text-ink-dim">No messages yet</p>
              )}

              {shared.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {shared.map((event) => (
                    <li key={event.id} className="flex items-center gap-2.5 text-[12px]">
                      <CalendarClock
                        className="h-3 w-3 shrink-0 text-ink-faint"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-ink-muted">
                        {event.title}
                      </span>
                      <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
                        {event.startAt?.toDate
                          ? format(event.startAt.toDate(), "d MMM")
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[12px] text-ink-dim">
                  No engagements together in the last {HISTORY_DAYS} days
                </p>
              )}
            </Section>
          )}
        </DialogContent>
      </Dialog>

      {calling && <OutgoingCall target={calling} onClose={() => setCalling(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 border-t border-line/[0.04] pt-4">
      <h3 className="mb-2.5 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-dim">
        {label}
      </h3>
      {children}
    </section>
  );
}
