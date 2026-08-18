"use client";

import { Task } from "@/types/task";
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import { DashboardCard, CardHeader, StatusChip, MeterBar } from "./dashboard-card";
import { themeColor } from "@/lib/theme/colors";

interface SystemHealthCardProps {
  tasks: Task[];
  hasProject: boolean;
}

export function SystemHealthCard({ tasks, hasProject }: SystemHealthCardProps) {
  if (!hasProject) {
    return (
      <DashboardCard className="h-full">
        <CardHeader title="System Health" icon={Activity} />
        <div className="flex flex-1 flex-col justify-end space-y-2">
          <p className="text-[15px] font-medium text-ink">No tasks to assess yet.</p>
          <p className="text-[13px] font-light leading-relaxed text-ink-muted">
            System health intelligence appears once work is actively tracked.
          </p>
        </div>
      </DashboardCard>
    );
  }

  const total = tasks.length;
  let score = 100;
  let status: "healthy" | "watch" | "at-risk" = "healthy";

  let done = 0;
  let inProgress = 0;
  let todo = 0;
  let overdue = 0;

  if (total > 0) {
    done = tasks.filter(t => t.status === "done").length;
    inProgress = tasks.filter(t => t.status === "doing").length;
    todo = tasks.filter(t => t.status === "todo").length;

    overdue = tasks.filter(t => {
      if (!t.dueDate || t.status === "done") return false;
      const due = t.dueDate.toDate();
      const today = new Date();
      today.setHours(0,0,0,0);
      due.setHours(0,0,0,0);
      return due.getTime() < today.getTime();
    }).length;

    const todoPercent = (todo / total) * 100;

    let penalty = 0;
    penalty += overdue * 15;
    if (todoPercent > 50) {
      penalty += (todoPercent - 50) * 0.5;
    }

    score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  }

  if (score >= 80) status = "healthy";
  else if (score >= 60) status = "watch";
  else status = "at-risk";

  const config = {
    healthy: { label: "Healthy", icon: TrendingUp, tone: "positive" as const, bar: themeColor.green },
    watch: { label: "Watch", icon: Minus, tone: "warning" as const, bar: themeColor.amber },
    "at-risk": { label: "At Risk", icon: TrendingDown, tone: "critical" as const, bar: themeColor.red }
  }[status];

  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;
  const doingPct = total > 0 ? Math.round((inProgress / total) * 100) : 0;
  const todoPct = total > 0 ? Math.round((todo / total) * 100) : 0;

  const breakdown = [
    { label: "Done", value: `${donePct}%`, critical: false },
    { label: "In Progress", value: `${doingPct}%`, critical: false },
    { label: "To Do", value: `${todoPct}%`, critical: false },
    { label: "Overdue", value: overdue.toString().padStart(2, "0"), critical: overdue > 0 },
  ];

  return (
    <DashboardCard className="h-full">
      <CardHeader
        title="System Health"
        icon={Activity}
        meta={<StatusChip label={config.label} icon={config.icon} tone={config.tone} />}
      />

      <div className="flex flex-1 flex-col justify-end">
        <div className="mb-6 flex items-baseline gap-3">
          <p className="text-[clamp(2.5rem,4.5vw,3.25rem)] font-extralight leading-none tracking-tight text-ink tabular-nums">
            {score}%
          </p>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            Overall Health
          </span>
        </div>

        {/* 2x2 on narrow columns, single row once there is room — the old
            non-wrapping flex row overflowed inside the half-width grid cell. */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          {breakdown.map((item) => (
            <div key={item.label} className="flex flex-col gap-1.5">
              <span className="font-mono text-[9px] uppercase leading-none tracking-[0.16em] text-ink-dim">
                {item.label}
              </span>
              <span
                className={cn(
                  "font-mono text-[15px] font-medium leading-none tabular-nums",
                  item.critical ? "text-orbit-red" : "text-ink"
                )}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>

        <MeterBar value={score} color={config.bar} className="mt-7" />
      </div>
    </DashboardCard>
  );
}
