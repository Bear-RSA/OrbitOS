"use client";

import { PersonalMetrics } from "@/types/dashboard";
import { DashboardCard, CardEyebrow, StatBlock } from "./dashboard-card";

interface PersonalMetricsCardProps {
  metrics: PersonalMetrics;
}

/* The one card on the dashboard that differs per viewer. Everything else
   is the workspace, identical for everyone in the org. */
export function PersonalMetricsCard({ metrics }: PersonalMetricsCardProps) {
  const { myActiveTasks, myOverdueTasks, myCompletedThisWeek } = metrics;

  return (
    <DashboardCard>
      <div className="flex flex-col justify-between gap-8 md:flex-row md:items-center md:gap-12">
        <div className="flex min-w-0 flex-col gap-2">
          <CardEyebrow>Your work</CardEyebrow>
          <p className="mt-1 text-xl font-light tracking-tight text-ink sm:text-2xl">Your week at a glance</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-orbit-green" aria-hidden />
            <span className="text-[12px] text-ink-muted">Live</span>
          </div>
        </div>

        {/* Grid rather than fixed `gap-16 lg:gap-24`, which overflowed on mobile */}
        <div className="grid shrink-0 grid-cols-3 gap-6 sm:gap-10">
          <StatBlock
            size="md"
            value={myActiveTasks.toString().padStart(2, '0')}
            label="Open tasks"
          />
          <StatBlock
            size="md"
            value={myOverdueTasks.toString().padStart(2, '0')}
            label="Overdue"
            tone={myOverdueTasks > 0 ? "critical" : "idle"}
          />
          <StatBlock
            size="md"
            value={myCompletedThisWeek.toString().padStart(2, '0')}
            label="Done this week"
            tone={myCompletedThisWeek > 0 ? "positive" : "idle"}
          />
        </div>
      </div>
    </DashboardCard>
  );
}
