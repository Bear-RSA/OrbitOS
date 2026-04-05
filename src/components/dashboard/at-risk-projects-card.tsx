"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ProjectRisk } from "@/types/dashboard";
import { cn } from "@/lib/utils/classnames";

interface AtRiskProjectsCardProps {
  projectRisk: ProjectRisk | null;
  hasProject: boolean;
}

const statusConfig = {
  healthy: {
    label: "Healthy",
    icon: TrendingUp,
    badgeBg: "bg-[#0F1A13]",
    textColor: "text-[#85C89B]",
  },
  watch: {
    label: "Watch",
    icon: Minus,
    badgeBg: "bg-[#1A150A]",
    textColor: "text-[#E5B567]",
  },
  "at-risk": {
    label: "At Risk",
    icon: TrendingDown,
    badgeBg: "bg-[#1A0A0A]",
    textColor: "text-[#E57A7A]",
  },
};

export function AtRiskProjectsCard({ projectRisk, hasProject }: AtRiskProjectsCardProps) {
  if (!hasProject || !projectRisk) {
    return (
      <div className="rounded-2xl p-8 sm:p-10 animate-fade-in bg-[#0A0A0A] ring-1 ring-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] flex flex-col relative overflow-hidden">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#888888] mb-8">
          Project Health
        </h3>
        <div className="flex-1 flex flex-col justify-end space-y-2">
          <p className="text-[15px] font-medium text-[#ededed]">No projects to assess yet.</p>
          <p className="text-sm text-[#888888] font-light leading-relaxed">Project health intelligence appears once work is actively in motion.</p>
        </div>
      </div>
    );
  }

  const config = statusConfig[projectRisk.status];
  const Icon = config.icon;

  return (
    <div className={cn(
      "rounded-[20px] p-8 sm:p-10 animate-fade-in bg-[#0A0A0A] hover:bg-[#111111] hover:-translate-y-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ring-1 ring-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] flex flex-col relative overflow-hidden"
    )}>
      <h3 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#888888] mb-12">
        Project Health
      </h3>
      
      <div className="flex-1 flex flex-col justify-end">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xl font-light text-[#ededed] tracking-tight">{projectRisk.project.name}</p>
            <p className="text-[13px] text-[#888888] mt-2 font-medium tracking-wide">
              {projectRisk.overdueCount} of {projectRisk.totalTasks} tasks overdue
              {projectRisk.totalTasks > 0
                ? ` (${Math.round(projectRisk.overduePercent * 100)}%)`
                : ""}
            </p>
          </div>
          <div className="flex-shrink-0 mt-1">
            <span className={cn(
              "px-3 py-1.5 rounded-md flex items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
              config.badgeBg
            )}>
              <Icon className={cn("w-3.5 h-3.5 mr-2", config.textColor)} />
              <span className={cn("text-[11px] font-semibold tracking-wider uppercase", config.textColor)}>
                {config.label}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
