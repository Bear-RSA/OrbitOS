"use client";

import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { DashboardActivityItem } from "@/types/dashboard";
import { describeEvent, TONE_COLOR } from "@/lib/formatters/event-registry";
import { formatRelativeTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/classnames";
import { DashboardCard, CardHeader, CardEyebrow } from "./dashboard-card";

/* ------------------------------------------------------------------ */
/*  Signal Log                                                         */
/*                                                                     */
/*  `recentActivity` was hardcoded to an empty array in both role      */
/*  branches of the dashboard service, even though the workspace has   */
/*  been writing ~28 kinds of activity event all along and             */
/*  event-registry.tsx already knows how to render every one of them.  */
/*                                                                     */
/*  Rows arrive from getOrgActivityAction — a polled server action,    */
/*  not the SSE stream. See that file for why.                         */
/* ------------------------------------------------------------------ */

interface ActivityFeedCardProps {
  items: DashboardActivityItem[];
  /** Set when the log could not be read. Distinct from an empty log. */
  error?: string | null;
  /** How many rows to show before the overflow line. */
  max?: number;
}

export function ActivityFeedCard({ items, error, max = 8 }: ActivityFeedCardProps) {
  const router = useRouter();
  const visible = items.slice(0, max);

  return (
    <DashboardCard className="h-full" tone="quiet" interactive={false}>
      <CardHeader
        title="Signal Log"
        icon={Radio}
        meta={<CardEyebrow>{error ? "Unavailable" : `${items.length} recent`}</CardEyebrow>}
      />

      {error ? (
        <div className="space-y-2">
          <p className="text-[14px] font-medium text-ink">Log unavailable.</p>
          <p className="text-[13px] font-light leading-relaxed text-ink-muted">{error}</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-1 flex-col justify-end space-y-2">
          <p className="text-[14px] font-medium text-ink">No signal yet.</p>
          <p className="text-[13px] font-light leading-relaxed text-ink-muted">
            Task moves, file drops and engagement changes stream here as they happen.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {visible.map((item) => {
            const descriptor = describeEvent(item.eventType);
            const Icon = descriptor.icon;
            const when = item.timestamp ? new Date(item.timestamp) : null;
            const href = item.projectId ? `/projects/${item.projectId}` : null;

            const body = (
              <>
                <Icon
                  className="mt-[3px] h-3 w-3 shrink-0"
                  style={{ color: TONE_COLOR[descriptor.tone] }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-snug text-ink-muted">
                    <span className="font-medium text-ink">{item.actorName}</span>{" "}
                    {descriptor.describe(item.metadata)}
                  </span>
                  <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
                    {when ? formatRelativeTime(when) : "just now"}
                  </span>
                </span>
              </>
            );

            return (
              <li key={item.id}>
                {href ? (
                  <button
                    type="button"
                    onClick={() => router.push(href)}
                    className={cn(
                      "-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-2.5 text-left",
                      "transition-colors duration-300 hover:bg-surface-raised",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    )}
                  >
                    {body}
                  </button>
                ) : (
                  <div className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5">{body}</div>
                )}
              </li>
            );
          })}

          {items.length > visible.length && (
            <li className="pt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-dim">
              +{items.length - visible.length} earlier
            </li>
          )}
        </ul>
      )}
    </DashboardCard>
  );
}
