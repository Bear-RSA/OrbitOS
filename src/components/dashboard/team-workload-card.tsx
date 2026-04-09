"use client";

import { Users } from "lucide-react";
import { MemberWorkload } from "@/types/dashboard";
import { cn } from "@/lib/utils/classnames";

interface TeamWorkloadCardProps {
  memberWorkloads: MemberWorkload[];
}

const statusConfig = {
  light: { label: "Under Capacity", color: "text-[#5D6D7E]", ringAccent: "ring-[#5D6D7E]/10", barColor: "#5D6D7E", barWidth: "25%" },
  balanced: { label: "Optimal Flow", color: "text-[#85C89B]", ringAccent: "ring-[#85C89B]/10", barColor: "#85C89B", barWidth: "50%" },
  heavy: { label: "High Volume", color: "text-[#E5B567]", ringAccent: "ring-[#E5B567]/10", barColor: "#E5B567", barWidth: "75%" },
  "needs-attention": { label: "Critical Load", color: "text-[#E57A7A]", ringAccent: "ring-[#E57A7A]/12", barColor: "#E57A7A", barWidth: "95%" },
};

export function TeamWorkloadCard({ memberWorkloads }: TeamWorkloadCardProps) {
  return (
    <div className="rounded-[24px] p-10 animate-fade-in bg-[#0A0A0A]/50 hover:bg-[#0C0C0C] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ring-1 ring-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.01)] group/card">
      <h3 className="text-[11px] font-mono uppercase tracking-[0.3em] text-[#444444] mb-12 flex items-center gap-3">
        <Users className="w-3.5 h-3.5 text-[#333333]" />
        Operational Load Grid
      </h3>
      
      {memberWorkloads.length === 0 ? (
        <div className="py-4 space-y-2">
           <p className="text-[15px] font-medium text-[#ededed]">Node network inactive.</p>
           <p className="text-[14px] text-[#666666] font-light leading-relaxed">Operational load metrics require primary operator assignment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {memberWorkloads.map((workload) => {
            const config = statusConfig[workload.status];
            return (
              <div key={workload.member.id} className={cn(
                "flex flex-col gap-7 p-7 rounded-2xl bg-white/[0.01] ring-1 ring-white/[0.03] transition-all duration-500 group/operator",
                "hover:bg-white/[0.025] hover:ring-white/[0.05] hover:-translate-y-[1px]"
              )}>
                {/* Operator Identity */}
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-lg bg-white/[0.03] ring-1 ring-white/[0.05] flex items-center justify-center flex-shrink-0 group-hover/operator:bg-white/[0.05] transition-all duration-500 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent pointer-events-none" />
                    <span className="text-[13px] font-medium text-[#ccc] relative">
                      {workload.member.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[14px] font-medium text-[#e0e0e0] leading-tight block tracking-tight truncate group-hover/operator:text-white transition-colors duration-300">
                      {workload.member.name}
                    </span>
                    <span className={cn("text-[9px] font-mono uppercase tracking-[0.2em] mt-1 block leading-none transition-all duration-500", config.color)}>
                      {config.label}
                    </span>
                  </div>
                </div>

                {/* Pressure Bar */}
                <div className="space-y-2">
                  <div className="h-[2px] w-full bg-white/[0.03] rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full pressure-fill"
                      style={{ width: config.barWidth, backgroundColor: config.barColor }}
                    />
                  </div>
                </div>
                
                {/* Metric Grid */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xl font-extralight text-[#ededed] tabular-nums leading-none">
                      {workload.metrics.activeTasks.toString().padStart(2, '0')}
                    </span>
                    <span className="text-[9px] text-[#3a3a3a] uppercase tracking-[0.15em] font-mono">Active</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={cn("text-xl font-extralight tabular-nums leading-none", workload.metrics.overdueTasks > 0 ? "text-orbit-red" : "text-[#ededed]/25")}>
                      {workload.metrics.overdueTasks.toString().padStart(2, '0')}
                    </span>
                    <span className="text-[9px] text-[#3a3a3a] uppercase tracking-[0.15em] font-mono">Overdue</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={cn("text-xl font-extralight tabular-nums leading-none", workload.metrics.completedThisWeek > 0 ? "text-orbit-green" : "text-[#ededed]/25")}>
                      {workload.metrics.completedThisWeek.toString().padStart(2, '0')}
                    </span>
                    <span className="text-[9px] text-[#3a3a3a] uppercase tracking-[0.15em] font-mono">Wins</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
