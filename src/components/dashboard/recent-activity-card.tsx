"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { Activity } from "lucide-react";
import {
  getRecentActivityAction,
  type DashboardActivityEvent,
} from "@/app/actions/dashboard-activity";
import { describeEvent, TONE_COLOR } from "@/lib/formatters/event-registry";
import { DashboardCard, CardHeader, CardEmpty } from "./dashboard-card";

/* ------------------------------------------------------------------ */
/*  Recent activity                                                    */
/*                                                                     */
/*  The last few things that happened anywhere in the workspace. Read  */
/*  once per dashboard load and on refresh, not streamed: the live     */
/*  feed belongs to a project page, where someone is watching one      */
/*  board. Here a few seconds of staleness costs nothing, and a socket */
/*  per project would cost reads on every open tab.                    */
/* ------------------------------------------------------------------ */

interface RecentActivityCardProps {
  refreshKey: number;
  max?: number;
}

export function RecentActivityCard({ refreshKey, max = 6 }: RecentActivityCardProps) {
  const router = useRouter();
  const [events, setEvents] = useState<DashboardActivityEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRecentActivityAction(max)
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setEvents(result.events);
          setFailed(false);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, max]);

  return (
    <DashboardCard className="h-full" tone="quiet" interactive={false}>
      <CardHeader title="Recent activity" icon={Activity} />

      {failed && !events ? (
        <CardEmpty
          icon={Activity}
          title="Activity could not load"
          hint="Refresh the dashboard to try again."
        />
      ) : events === null ? (
        <ul className="flex flex-col gap-3" aria-busy>
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="h-9 animate-pulse rounded-lg bg-surface-raised/60" />
          ))}
        </ul>
      ) : events.length === 0 ? (
        <CardEmpty
          icon={Activity}
          title="Nothing has happened yet"
          hint="Task moves, notes, files and meetings across every project show here."
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {events.map((event) => {
            const descriptor = describeEvent(event.eventType);
            const Icon = descriptor.icon;
            const at = event.timestamp ? new Date(event.timestamp) : null;
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/projects/${event.projectId}`)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-300 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <Icon
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    style={{ color: TONE_COLOR[descriptor.tone] }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] leading-snug text-ink-muted">
                      <span className="font-medium text-ink">{event.actorName}</span>{" "}
                      {descriptor.describe(event.metadata)}
                    </p>
                    <p className="mt-1 truncate text-[12px] text-ink-dim">
                      {event.projectName}
                      {at && <> · {formatDistanceToNowStrict(at)} ago</>}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}
