"use client";

import { TrendingUp } from "lucide-react";
import { WeeklyProgressDay } from "@/types/dashboard";
import { cn } from "@/lib/utils/classnames";
import { DashboardCard, CardHeader, CardEyebrow, StatBlock } from "./dashboard-card";

/* ------------------------------------------------------------------ */
/*  This Week                                                          */
/*                                                                     */
/*  Every other number on the dashboard is a point-in-time count. This */
/*  is the only one with a shape: seven bars showing whether the week  */
/*  is accelerating or stalling.                                       */
/* ------------------------------------------------------------------ */

interface WeeklyProgressCardProps {
  weeklyProgress: WeeklyProgressDay[];
  /** Rendered as the headline figure. Owners see org-wide completions. */
  completedThisWeek: number;
}

export function WeeklyProgressCard({ weeklyProgress, completedThisWeek }: WeeklyProgressCardProps) {
  const today = new Date();
  const maxCount = Math.max(...weeklyProgress.map((d) => d.count), 1);

  return (
    <DashboardCard className="h-full" tone="quiet" interactive={false}>
      <CardHeader
        title="This Week"
        icon={TrendingUp}
        meta={<CardEyebrow>{completedThisWeek > 0 ? "In motion" : "Idle"}</CardEyebrow>}
      />

      <div className="flex flex-1 flex-col justify-between gap-8">
        <StatBlock
          size="md"
          value={completedThisWeek}
          label="Completed This Week"
          tone={completedThisWeek > 0 ? "positive" : "idle"}
        />

        <div className="flex h-24 items-end gap-2 sm:gap-3">
          {weeklyProgress.map((day) => {
            const isToday = day.date.toDateString() === today.toDateString();
            const isFuture = day.date > today && !isToday;
            const heightPercent = isFuture ? 0 : (day.count / maxCount) * 100;

            return (
              <div key={day.day} className="group/day relative flex flex-1 flex-col items-center gap-2.5">
                {day.count > 0 && !isFuture && (
                  <span className="absolute -top-5 font-mono text-[10px] tabular-nums text-ink opacity-0 transition-opacity group-hover/day:opacity-100">
                    {day.count}
                  </span>
                )}

                <div className="flex h-[60px] w-full flex-col justify-end">
                  <div
                    className={cn(
                      "w-full rounded-[3px] transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
                      isFuture || day.count === 0
                        ? "h-1 bg-surface-hover"
                        : isToday
                        ? "bg-ink"
                        : "bg-surface-highest"
                    )}
                    style={{
                      height: isFuture || day.count === 0 ? undefined : `${Math.max(heightPercent, 12)}%`,
                    }}
                  />
                </div>

                <span
                  className={cn(
                    "font-mono text-[9px] uppercase tracking-[0.12em] transition-colors",
                    isToday ? "text-ink" : "text-ink-dim"
                  )}
                >
                  {day.shortDay}
                </span>

                {/* The bars are decorative; this is the readable version. */}
                <span className="sr-only">
                  {day.day}: {day.count} completed
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardCard>
  );
}
