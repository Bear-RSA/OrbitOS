"use client";

import { OwnerDashboardData } from "@/types/dashboard";
import { cn } from "@/lib/utils/classnames";

interface OwnerAttentionCardProps {
  metrics: OwnerDashboardData["metrics"];
  hasProject: boolean;
}

export function OwnerAttentionCard({ metrics, hasProject }: OwnerAttentionCardProps) {
  const { activeProjects, activeWorkload } = metrics;

  return (
    <div className={cn(
      "rounded-[24px] p-10 animate-fade-in transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ring-1 ring-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.01)] flex flex-col relative overflow-hidden group",
      !hasProject 
        ? "bg-[#0A0A0A]"
        : "bg-gradient-to-br from-white/[0.02] to-transparent" 
    )}>
      {/* Hover surface glow */}
      <div className="absolute inset-0 bg-white/[0.008] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      
      {/* Header */}
      <div className="mb-10 flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#666666] flex items-center gap-3">
          {hasProject && (
            <span className="w-1.5 h-1.5 rounded-full bg-white/20 inline-block" />
          )}
          Executive Attention
        </h3>
        <div className="text-[10px] font-mono text-[#333333] tracking-[0.15em] uppercase">
          {hasProject ? "Active" : "Standby"}
        </div>
      </div>
      
      <div className="flex-1 flex flex-col justify-end">
        {!hasProject ? (
          <div className="space-y-3">
            <p className="text-[15px] font-medium text-[#ededed]">Stream initialization required.</p>
            <p className="text-[14px] text-[#666666] font-light leading-relaxed">Telemetry metrics will appear once active work is detected in the workspace.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-10">
            {/* Active Projects */}
            <div className="group/metric">
              <p className={cn(
                "text-[56px] font-extralight tracking-tighter leading-none mb-3 transition-all duration-700",
                activeProjects > 0 ? "text-[#ededed]" : "text-[#ededed]/30"
              )}>
                {activeProjects}
              </p>
              <p className="text-[10px] text-[#444444] group-hover/metric:text-[#666666] uppercase tracking-[0.2em] font-mono transition-colors duration-500">
                Active Projects
              </p>
            </div>
            
            {/* Team Capacity / Workspace Health */}
            <div className="group/metric">
              <p className={cn(
                "text-[56px] font-extralight tracking-tighter leading-none mb-3 transition-all duration-700",
                activeWorkload > 0 ? "text-[#ededed]" : "text-[#ededed]/20"
              )}>
                {activeWorkload}
              </p>
              <p className="text-[10px] text-[#444444] group-hover/metric:text-[#666666] uppercase tracking-[0.2em] font-mono transition-colors duration-500">
                Active Workload
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
