"use client";

import { AlertCircle, Clock } from "lucide-react";
import { AttentionMetrics } from "@/types/dashboard";
import { cn } from "@/lib/utils/classnames";

interface OwnerAttentionCardProps {
  metrics: AttentionMetrics;
  hasProject: boolean;
}

export function OwnerAttentionCard({ metrics, hasProject }: OwnerAttentionCardProps) {
  const { overdueCount, inactiveCount } = metrics;
  const total = overdueCount + inactiveCount;
  const allClear = total === 0;

  return (
    <div className={cn(
      "rounded-[20px] p-8 sm:p-10 animate-fade-in transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white/[0.015] hover:-translate-y-1 ring-1 ring-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] flex flex-col relative overflow-hidden",
      !hasProject 
        ? "bg-[#0A0A0A]"
        : allClear
        ? "bg-gradient-to-br from-[#0A0A0A] to-[#050A07]"
        : "bg-gradient-to-br from-[#0A0A0A] to-[#120808]"
    )}>
      <div className="mb-8">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#888888] flex items-center gap-3">
          {hasProject && (
            allClear ? (
              <span className="w-1.5 h-1.5 rounded-full bg-orbit-green/80 inline-block shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-orbit-red/80 inline-block shadow-[0_0_8px_rgba(248,113,113,0.4)] animate-pulse" />
            )
          )}
          Needs Attention
        </h3>
      </div>
      
      <div className="flex-1 flex flex-col justify-end">
        {!hasProject ? (
          <div className="space-y-2">
            <p className="text-[15px] font-medium text-[#ededed]">No urgent work yet.</p>
            <p className="text-sm text-[#888888] font-light leading-relaxed">Overdue and inactive tasks will appear here in the workspace layer.</p>
          </div>
        ) : allClear ? (
          <p className="text-[15px] text-[#A0CBA0] font-light leading-relaxed">
            All clear — no overdue or stalled tasks currently demand attention.
          </p>
        ) : (
          <div className="space-y-6">
            {overdueCount > 0 && (
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#1A0A0A] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-4 h-4 text-[#FF6B6B]" />
                </div>
                <div>
                  <p className="text-3xl font-light text-[#ededed] tracking-tight leading-none">
                    {overdueCount}
                  </p>
                  <p className="text-[13px] text-[#888888] mt-1.5 uppercase tracking-wider font-medium">
                    overdue task{overdueCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            )}
            {inactiveCount > 0 && (
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#1A150A] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] flex items-center justify-center flex-shrink-0">
                  <Clock className="w-4 h-4 text-[#F5B041]" />
                </div>
                <div>
                  <p className="text-3xl font-light text-[#ededed] tracking-tight leading-none">
                    {inactiveCount}
                  </p>
                  <p className="text-[13px] text-[#888888] mt-1.5 uppercase tracking-wider font-medium">
                    inactive 48h+
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
