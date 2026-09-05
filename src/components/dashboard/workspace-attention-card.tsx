"use client";

import { OwnerDashboardData } from "@/types/dashboard";
import { DashboardCard, CardHeader, StatBlock, CardEyebrow } from "./dashboard-card";

interface OwnerAttentionCardProps {
  metrics: OwnerDashboardData["metrics"];
  hasProject: boolean;
}

export function OwnerAttentionCard({ metrics, hasProject }: OwnerAttentionCardProps) {
  const { activeProjects, activeWorkload, completedThisWeek } = metrics;

  return (
    <DashboardCard className="h-full">
      <CardHeader
        title="Executive Attention"
        meta={
          <CardEyebrow className="flex items-center gap-2">
            <span
              className={
                hasProject
                  ? "h-1.5 w-1.5 rounded-full bg-orbit-green/80"
                  : "h-1.5 w-1.5 rounded-full bg-surface-active"
              }
              aria-hidden
            />
            {hasProject ? "Active" : "Standby"}
          </CardEyebrow>
        }
      />

      <div className="flex flex-1 flex-col justify-end">
        {!hasProject ? (
          <div className="space-y-2">
            <p className="text-[15px] font-medium text-ink">Stream initialization required.</p>
            <p className="text-[13px] font-light leading-relaxed text-ink-muted">
              Telemetry metrics will appear once active work is detected in the workspace.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 sm:gap-6">
            <StatBlock
              size="md"
              value={activeProjects}
              label="Active Projects"
              tone={activeProjects > 0 ? "default" : "idle"}
            />
            <StatBlock
              size="md"
              value={activeWorkload}
              label="Active Workload"
              tone={activeWorkload > 0 ? "default" : "idle"}
            />
            {/* Computed by the service since day one and rendered nowhere —
                the owner had no read on throughput, only on backlog. */}
            <StatBlock
              size="md"
              value={completedThisWeek}
              label="Done This Week"
              tone={completedThisWeek > 0 ? "positive" : "idle"}
            />
          </div>
        )}
      </div>
    </DashboardCard>
  );
}
