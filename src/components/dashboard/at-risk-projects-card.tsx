"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ProjectHealth } from "@/types/dashboard";
import { cn } from "@/lib/utils/classnames";

interface AtRiskProjectsCardProps {
  projectsHealth: ProjectHealth[];
  hasProject: boolean;
}

const statusConfig = {
  healthy: {
    label: "Healthy",
    icon: TrendingUp,
    badgeBg: "bg-[#0F1A13]",
    textColor: "text-orbit-green",
    ringColor: "ring-orbit-green/15",
    barColor: "#85C89B",
  },
  watch: {
    label: "Watch",
    icon: Minus,
    badgeBg: "bg-[#1A180A]",
    textColor: "text-orbit-amber",
    ringColor: "ring-orbit-amber/15",
    barColor: "#E5B567",
  },
  "at-risk": {
    label: "At Risk",
    icon: TrendingDown,
    badgeBg: "bg-[#1A0A0A]",
    textColor: "text-orbit-red",
    ringColor: "ring-orbit-red/15",
    barColor: "#E57A7A",
  },
};

export function AtRiskProjectsCard({ projectsHealth, hasProject }: AtRiskProjectsCardProps) {
  const project = projectsHealth[0];

  if (!hasProject || !project) {
    return (
      <div className="rounded-[24px] p-10 animate-fade-in bg-[#0A0A0A] ring-1 ring-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] flex flex-col relative overflow-hidden">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#555555] mb-8">
          System Health
        </h3>
        <div className="flex-1 flex flex-col justify-end space-y-2">
          <p className="text-[15px] font-medium text-[#ededed]">No projects to assess yet.</p>
          <p className="text-sm text-[#666666] font-light leading-relaxed">Project health intelligence appears once work is actively in motion.</p>
        </div>
      </div>
    );
  }

  const config = statusConfig[project.status];
  const Icon = config.icon;

  return (
    <div className={cn(
      "rounded-[24px] p-10 animate-fade-in bg-[#0A0A0A]/50 hover:bg-[#0C0C0C] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ring-1 ring-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.01)] flex flex-col relative overflow-hidden group"
    )}>
      <div className="absolute inset-0 bg-white/[0.005] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#444444] mb-12">
        System Health
      </h3>
      
      <div className="flex-1 flex flex-col justify-end">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-light text-[#ededed] tracking-tight truncate group-hover:text-white transition-colors duration-500">{project.project.name}</p>
            <div className="flex items-center gap-5 mt-5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#444444]">Overdue</span>
                <span className={cn("text-[13px] font-mono tabular-nums font-medium", project.overdueCount > 0 ? "text-orbit-red" : "text-[#333333]")}>
                  {project.overdueCount.toString().padStart(2, '0')}
                </span>
              </div>
              <span className="w-px h-3 bg-white/[0.04]" />
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#444444]">Blocked</span>
                <span className={cn("text-[13px] font-mono tabular-nums font-medium", project.blockedCount > 0 ? "text-orbit-red" : "text-[#333333]")}>
                  {project.blockedCount.toString().padStart(2, '0')}
                </span>
              </div>
              <span className="w-px h-3 bg-white/[0.04]" />
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#444444]">Active</span>
                <span className="text-[13px] font-mono tabular-nums font-medium text-[#555555]">
                  {project.totalActiveTasks.toString().padStart(2, '0')}
                </span>
              </div>
            </div>
            
            {/* Pressure Bar */}
            {project.overduePercent > 0 && (
              <div className="mt-8 space-y-3">
                <div className="h-[2px] w-full bg-white/[0.03] overflow-hidden rounded-full">
                  <div 
                    className="h-full rounded-full pressure-fill"
                    style={{ width: `${Math.min(project.overduePercent, 100)}%`, backgroundColor: config.barColor }} 
                  />
                </div>
                <p className="text-[10px] text-[#383838] font-mono tracking-[0.2em] uppercase">
                  {project.overduePercent}% System Drift
                </p>
              </div>
            )}
          </div>

          {/* Status Badge */}
          <div className="flex-shrink-0">
            <span className={cn(
              "px-3 py-1.5 rounded-md flex items-center ring-1 ring-inset transition-all duration-500 group-hover:ring-opacity-30",
              config.badgeBg,
              config.ringColor
            )}>
              <Icon className={cn("w-3.5 h-3.5 mr-2", config.textColor)} />
              <span className={cn("text-[10px] font-semibold tracking-wider uppercase", config.textColor)}>
                {config.label}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
