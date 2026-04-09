"use client";

import { CheckCircle2, Clock, AlertCircle, Inbox } from "lucide-react";
import { MemberDashboardData } from "@/types/dashboard";
import { cn } from "@/lib/utils/classnames";

interface MemberPersonalMetricsCardProps {
  metrics: MemberDashboardData["metrics"];
}

export function MemberPersonalMetricsCard({ metrics }: MemberPersonalMetricsCardProps) {
  const { myActiveTasks, myOverdueTasks, myBlockedTasks, myCompletedThisWeek } = metrics;
  
  return (
    <div className="rounded-[24px] p-10 animate-fade-in bg-gradient-to-br from-white/[0.02] to-transparent ring-1 ring-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.01)] group relative overflow-hidden">
      <div className="absolute inset-0 bg-white/[0.01] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-12">
        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-mono uppercase tracking-[0.3em] text-[#444444] mb-2 flex items-center gap-3">
            Personnel Telemetry
          </h3>
          <p className="text-2xl font-light text-[#ededed] tracking-tight">Active Deployment Phase</p>
          <div className="flex items-center gap-2 mt-4">
            <span className="w-1.5 h-1.5 rounded-full bg-orbit-green animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#555555]">System Operational</span>
          </div>
        </div>

        <div className="flex items-center gap-16 lg:gap-24">
          <div className="group/metric text-center md:text-left">
            <p className="text-6xl font-extralight text-[#ededed] tracking-tighter leading-none mb-4 tabular-nums">
              {myActiveTasks.toString().padStart(2, '0')}
            </p>
            <p className="text-[11px] text-[#444444] group-hover/metric:text-[#666666] uppercase tracking-[0.2em] font-mono transition-colors">
              Active Nodes
            </p>
          </div>

          <div className="group/metric text-center md:text-left">
            <p className={cn(
              "text-6xl font-extralight tracking-tighter leading-none mb-4 tabular-nums",
              myOverdueTasks > 0 ? "text-orbit-red" : "text-[#ededed]/20"
            )}>
              {myOverdueTasks.toString().padStart(2, '0')}
            </p>
            <p className="text-[11px] text-[#444444] group-hover/metric:text-[#666666] uppercase tracking-[0.2em] font-mono transition-colors">
              Overdue Drift
            </p>
          </div>

          <div className="group/metric text-center md:text-left">
            <p className="text-6xl font-extralight text-orbit-green tracking-tighter leading-none mb-4 tabular-nums">
              {myCompletedThisWeek.toString().padStart(2, '0')}
            </p>
            <p className="text-[11px] text-[#444444] group-hover/metric:text-[#666666] uppercase tracking-[0.2em] font-mono transition-colors">
              Weekly Wins
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
