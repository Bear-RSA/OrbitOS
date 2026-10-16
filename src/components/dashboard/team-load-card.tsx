"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { Gauge } from "lucide-react";
import { Member } from "@/types/member";
import { Task } from "@/types/task";
import { OrbitEvent } from "@/types/event";
import { WorkloadStatus } from "@/types/dashboard";
import { calculateMemberWorkload } from "@/lib/utils/dashboard-logic";
import { Presence, resolvePresence, presenceTone } from "@/lib/members/presence";
import { engagementPresenceByMember } from "@/lib/calendar/presence";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils/classnames";
import { DashboardCard, CardHeader, CardEyebrow, StatusChip } from "./dashboard-card";

/* ------------------------------------------------------------------ */
/*  Team load                                                          */
/*                                                                     */
/*  This replaces the Presence panel. Presence on its own answered     */
/*  "who is online", which outside working hours is "nobody" and says  */
/*  nothing. Load answers the question a lead actually has before      */
/*  handing out work — who has room and who is drowning — and keeps    */
/*  the presence dot on every face, so "is this person reachable"      */
/*  is still one glance away.                                          */
/*                                                                     */
/*  `calculateMemberWorkload` already drove /teams; the dashboard now  */
/*  reads the same verdict instead of inventing a second one.          */
/* ------------------------------------------------------------------ */

interface TeamLoadCardProps {
  members: Member[];
  tasks: Task[];
  /** Today's engagements, for meeting-aware presence. Null while loading. */
  events: OrbitEvent[] | null;
  viewerId: string;
  clock24h: boolean;
  max?: number;
}

const PRESENCE_LABEL: Record<Presence, string> = {
  available: "Available",
  focused: "Heads down",
  offline: "Offline",
};

const LOAD: Record<WorkloadStatus, { label: string; tone: "positive" | "neutral" | "warning" | "critical"; rank: number }> = {
  "needs-attention": { label: "Overloaded", tone: "critical", rank: 0 },
  heavy: { label: "Heavy", tone: "warning", rank: 1 },
  balanced: { label: "Balanced", tone: "neutral", rank: 2 },
  light: { label: "Has room", tone: "positive", rank: 3 },
};

export function TeamLoadCard({ members, tasks, events, viewerId, clock24h, max = 6 }: TeamLoadCardProps) {
  const inMeeting = useMemo(() => {
    if (!events || events.length === 0) return {};
    const names = Object.fromEntries(members.map((m) => [m.id, m.name || "Unnamed member"]));
    return engagementPresenceByMember(events, members.map((m) => m.id), names);
  }, [events, members]);

  const rows = useMemo(() => {
    return members
      .map((member) => ({
        workload: calculateMemberWorkload(member, tasks),
        presence: resolvePresence({
          operationalStatus: member.operationalStatus,
          manualOverride: member.manualOverride,
          lastActivityMs: member.lastActivity?.toMillis() ?? null,
        }),
        meeting: inMeeting[member.id],
      }))
      // Most stretched first: that is who needs a lead's attention.
      .sort((a, b) => {
        const rank = LOAD[a.workload.status].rank - LOAD[b.workload.status].rank;
        if (rank !== 0) return rank;
        const active = b.workload.metrics.activeTasks - a.workload.metrics.activeTasks;
        if (active !== 0) return active;
        return (a.workload.member.name || "").localeCompare(b.workload.member.name || "");
      });
  }, [members, tasks, inMeeting]);

  const onlineCount = rows.filter((r) => r.presence !== "offline").length;
  const visible = rows.slice(0, max);
  const timeFormat = clock24h ? "HH:mm" : "h:mmaaa";

  return (
    <DashboardCard className="h-full" tone="quiet" interactive={false}>
      <CardHeader
        title="Team load"
        icon={Gauge}
        meta={
          <CardEyebrow className={cn(onlineCount > 0 && "text-orbit-green")}>
            {onlineCount} of {rows.length} online
          </CardEyebrow>
        }
      />

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col justify-end space-y-2">
          <p className="text-[14px] font-medium text-ink">No teammates yet.</p>
          <p className="text-[13px] font-light leading-relaxed text-ink-muted">
            Invited members appear here once they have signed in at least once.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {visible.map(({ workload, presence, meeting }) => {
            const { member, metrics, status } = workload;
            const load = LOAD[status];
            return (
              <li
                key={member.id}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-300 hover:bg-surface-raised/60"
              >
                <div className="relative shrink-0">
                  <UserAvatar photoURL={member.photoURL} name={member.name} size="sm" />
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface-sunken",
                      presenceTone(presence)
                    )}
                    aria-hidden
                  />
                  <span className="sr-only">{meeting ? "In a meeting" : PRESENCE_LABEL[presence]}</span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium leading-tight text-ink-muted">
                    {member.name || "Unnamed member"}
                    {member.id === viewerId && (
                      <span className="ml-1.5 text-[12px] text-ink-dim">You</span>
                    )}
                  </p>
                  <p className="mt-1 truncate text-[12px] text-ink-dim">
                    {metrics.activeTasks} active
                    {metrics.overdueTasks > 0 && (
                      <span className="text-orbit-red"> · {metrics.overdueTasks} overdue</span>
                    )}
                    {metrics.blockedTasks > 0 && <span> · {metrics.blockedTasks} blocked</span>}
                    {meeting && <span> · In a meeting until {format(meeting.endsAt, timeFormat)}</span>}
                  </p>
                </div>

                <StatusChip label={load.label} tone={load.tone} />
              </li>
            );
          })}

          {rows.length > visible.length && (
            <li className="pt-2 text-[12px] text-ink-dim">
              +{rows.length - visible.length} more on /teams
            </li>
          )}
        </ul>
      )}
    </DashboardCard>
  );
}
