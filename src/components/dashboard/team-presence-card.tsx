"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { Signal } from "lucide-react";
import { Member } from "@/types/member";
import { OrbitEvent } from "@/types/event";
import { Presence, resolvePresence, presenceTone } from "@/lib/members/presence";
import { engagementPresenceByMember } from "@/lib/calendar/presence";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils/classnames";
import { DashboardCard, CardHeader, CardEyebrow } from "./dashboard-card";

/* ------------------------------------------------------------------ */
/*  Presence                                                           */
/*                                                                     */
/*  The heartbeat has been writing `lastActivity` every three minutes  */
/*  all along, and `resolvePresence` has been deciding what it means,  */
/*  but no dashboard surface ever showed the answer. In a workspace    */
/*  with DMs and internal calls built in, "is this person actually     */
/*  reachable right now" is the question you ask immediately before    */
/*  every one of those actions.                                        */
/*                                                                     */
/*  Meeting state overrides the dot's label: someone sitting in an     */
/*  engagement reads as available to the heartbeat, which is true and  */
/*  unhelpful. Their calendar is the better answer.                    */
/* ------------------------------------------------------------------ */

interface TeamPresenceCardProps {
  members: Member[];
  /** Today's engagements, for meeting-aware presence. Null while loading. */
  events: OrbitEvent[] | null;
  /** Moves the viewer to the top of the list. */
  viewerId: string;
  clock24h: boolean;
}

const PRESENCE_LABEL: Record<Presence, string> = {
  available: "Available",
  focused: "Heads down",
  offline: "Offline",
};

/** Present first, then heads-down, then offline; alphabetical within each. */
const PRESENCE_RANK: Record<Presence, number> = {
  available: 0,
  focused: 1,
  offline: 2,
};

export function TeamPresenceCard({ members, events, viewerId, clock24h }: TeamPresenceCardProps) {
  const inMeeting = useMemo(() => {
    if (!events || events.length === 0) return {};
    const names = Object.fromEntries(members.map((m) => [m.id, m.name || "Operative"]));
    return engagementPresenceByMember(events, members.map((m) => m.id), names);
  }, [events, members]);

  const rows = useMemo(() => {
    return members
      .map((member) => ({
        member,
        presence: resolvePresence({
          operationalStatus: member.operationalStatus,
          lastActivityMs: member.lastActivity?.toMillis() ?? null,
        }),
        meeting: inMeeting[member.id],
      }))
      .sort((a, b) => {
        // You first — you are the one row whose state you can change.
        if (a.member.id === viewerId) return -1;
        if (b.member.id === viewerId) return 1;
        const rank = PRESENCE_RANK[a.presence] - PRESENCE_RANK[b.presence];
        if (rank !== 0) return rank;
        return (a.member.name || "").localeCompare(b.member.name || "");
      });
  }, [members, inMeeting, viewerId]);

  const onlineCount = rows.filter((r) => r.presence !== "offline").length;
  const timeFormat = clock24h ? "HH:mm" : "h:mmaaa";

  return (
    <DashboardCard className="h-full" tone="quiet" interactive={false}>
      <CardHeader
        title="Presence"
        icon={Signal}
        meta={
          <CardEyebrow className={cn(onlineCount > 0 && "text-orbit-green")}>
            {onlineCount} of {rows.length} online
          </CardEyebrow>
        }
      />

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col justify-end space-y-2">
          <p className="text-[14px] font-medium text-ink">No operators yet.</p>
          <p className="text-[13px] font-light leading-relaxed text-ink-muted">
            Invited members appear here once they have signed in at least once.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map(({ member, presence, meeting }) => (
            <li
              key={member.id}
              className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-300 hover:bg-surface-raised/60"
            >
              <div className="relative shrink-0">
                <UserAvatar photoURL={member.photoURL} name={member.name} size="sm" />
                {/* Ringed in the card's own ground so the dot stays legible
                    wherever it overlaps the avatar. */}
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface-sunken",
                    presenceTone(presence)
                  )}
                  aria-hidden
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium leading-tight text-ink-muted">
                  {member.name || "Unnamed operative"}
                  {member.id === viewerId && (
                    <span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint">
                      You
                    </span>
                  )}
                </p>
                <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
                  {meeting
                    ? `In a meeting until ${format(meeting.endsAt, timeFormat)}`
                    : PRESENCE_LABEL[presence]}
                  {member.roleDescriptor && !meeting && (
                    <span className="text-ink-faint"> · {member.roleDescriptor}</span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
