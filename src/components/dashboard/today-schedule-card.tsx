"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarClock, Video, MapPin, Users } from "lucide-react";
import { OrbitEvent, RsvpStatus } from "@/types/event";
import { Member } from "@/types/member";
import { getEventsInRange } from "@/lib/queries/events";
import { currentEngagement } from "@/lib/calendar/presence";
import { cn } from "@/lib/utils/classnames";
import { DashboardCard, CardHeader, CardEyebrow, StatusChip } from "./dashboard-card";

/* ------------------------------------------------------------------ */
/*  Today                                                              */
/*                                                                     */
/*  The engagements subsystem — events, RSVP, the ICS feed, meeting-   */
/*  aware presence — was fully built and completely absent from the    */
/*  dashboard. Every number on this page was a count of outstanding    */
/*  work; nothing told you that you were due in a room in twenty       */
/*  minutes.                                                           */
/* ------------------------------------------------------------------ */

interface TodayScheduleCardProps {
  orgId: string;
  uid: string;
  members: Member[];
  /** Owners see the whole org's day; members see only their own. */
  scope: "org" | "mine";
  /** Mirrors the header clock so one page never shows both formats. */
  clock24h: boolean;
  /** Bumped by the dashboard Refresh button to force a re-read. */
  refreshKey?: number;
}

const RSVP_LABEL: Record<RsvpStatus, string> = {
  accepted: "Going",
  declined: "Declined",
  tentative: "Maybe",
  pending: "No reply",
};

export function TodayScheduleCard({
  orgId,
  uid,
  members,
  scope,
  clock24h,
  refreshKey = 0,
}: TodayScheduleCardProps) {
  const [events, setEvents] = useState<OrbitEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    setFailed(false);
    getEventsInRange(orgId, start, end)
      .then((result) => {
        if (!cancelled) setEvents(result);
      })
      .catch((err) => {
        // Most likely the (orgId, startAt) composite index. The schedule is
        // one card, not the page — surface it here and let the rest render.
        console.error("[TodaySchedule] range query failed", err);
        if (!cancelled) {
          setEvents([]);
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, refreshKey]);

  const memberNames = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.name || "Operative"])),
    [members]
  );

  const visible = useMemo(() => {
    if (!events) return [];
    return events.filter((event) => {
      if (event.status === "cancelled") return false;
      if (scope === "mine") return event.attendees?.includes(uid);
      return true;
    });
  }, [events, scope, uid]);

  // Which engagement the viewer is sitting in right now, if any. All-day
  // blocks are excluded by `currentEngagement` on purpose.
  const live = useMemo(
    () => (events ? currentEngagement(events, uid, memberNames) : null),
    [events, uid, memberNames]
  );

  const timeFormat = clock24h ? "HH:mm" : "h:mmaaa";

  return (
    <DashboardCard className="h-full" tone="quiet" interactive={false}>
      <CardHeader
        title="Today"
        icon={CalendarClock}
        meta={
          visible.length > 0 ? (
            <CardEyebrow>
              {visible.length} {visible.length === 1 ? "engagement" : "engagements"}
            </CardEyebrow>
          ) : (
            <CardEyebrow>Clear</CardEyebrow>
          )
        }
      />

      {events === null ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          Resolving schedule…
        </p>
      ) : failed ? (
        <div className="space-y-2">
          <p className="text-[14px] font-medium text-ink">Schedule unavailable.</p>
          <p className="text-[13px] font-light leading-relaxed text-ink-muted">
            Today&apos;s engagements could not be read. The rest of the dashboard is unaffected.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-1 flex-col justify-end space-y-2">
          <p className="text-[14px] font-medium text-ink">Nothing scheduled today.</p>
          <p className="text-[13px] font-light leading-relaxed text-ink-muted">
            Engagements booked from a project calendar appear here on the day they run.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {visible.map((event) => {
            const isLive = live?.eventId === event.id;
            const myRsvp: RsvpStatus | null = event.attendees?.includes(uid)
              ? event.rsvp?.[uid] ?? "pending"
              : null;

            const attendeeCount =
              (event.attendees?.length ?? 0) + (event.guests?.length ?? 0);

            return (
              <li
                key={event.id}
                className={cn(
                  "-mx-2 flex items-start gap-4 rounded-lg px-2 py-2.5 transition-colors duration-300",
                  isLive ? "bg-surface-raised" : "hover:bg-surface-raised/60"
                )}
              >
                {/* All-day engagements own a day, not an instant — reading a
                    clock time off startAt would shift them by timezone. */}
                <span
                  className={cn(
                    "w-[4.5rem] shrink-0 pt-0.5 font-mono text-[11px] tabular-nums",
                    isLive ? "text-ink" : "text-ink-dim"
                  )}
                >
                  {event.allDay ? "All day" : format(event.startAt.toDate(), timeFormat)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-medium leading-tight text-ink-muted">
                      {event.title}
                    </p>
                    {isLive && <StatusChip label="Now" tone="warning" />}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
                    {attendeeCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-2.5 w-2.5" aria-hidden />
                        {attendeeCount}
                      </span>
                    )}
                    {event.location && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden />
                        <span className="truncate">{event.location}</span>
                      </span>
                    )}
                    {myRsvp && (
                      <span className={cn(myRsvp === "pending" && "text-orbit-amber")}>
                        {RSVP_LABEL[myRsvp]}
                      </span>
                    )}
                  </div>
                </div>

                {event.meetingUrl && (
                  <a
                    href={event.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-control px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-muted ring-1 ring-inset ring-line/[0.08] transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <Video className="h-3 w-3" aria-hidden />
                    Join
                    <span className="sr-only">{event.title}</span>
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}
