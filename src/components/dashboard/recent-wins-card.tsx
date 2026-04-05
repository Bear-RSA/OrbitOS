"use client";

import { Trophy } from "lucide-react";
import { RecentWin } from "@/types/dashboard";
import { formatRelativeTime } from "@/lib/utils/dates";

interface RecentWinsCardProps {
  wins: RecentWin[];
}

export function RecentWinsCard({ wins }: RecentWinsCardProps) {
  return (
    <div className="rounded-[20px] p-8 animate-fade-in bg-[#0A0A0A] hover:bg-[#111111] hover:-translate-y-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ring-1 ring-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] flex flex-col relative overflow-hidden">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#888888] mb-8 flex items-center gap-2">
        <Trophy className="w-3.5 h-3.5 opacity-60" />
        Recent Wins
      </h3>
      
      <div className="flex-1 flex flex-col justify-end">
        {wins.length === 0 ? (
          <div className="h-24 flex flex-col justify-end space-y-2 pb-2">
            <p className="text-[14px] font-medium text-[#ededed]">No recent wins.</p>
            <p className="text-[13px] text-[#888888] font-light leading-relaxed">Completed operations will stream here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {wins.map((win) => (
              <div
                key={win.task.id}
                className="flex items-start gap-4 group rounded-xl hover:bg-[#1A1A1A] hover:-translate-y-[2px] -mx-4 px-4 py-3 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-default"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-[#ededed]/30 mt-2.5 flex-shrink-0 group-hover:bg-[#ededed]/60 transition-colors" />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-[#ededed] truncate mb-1">
                    {win.task.title}
                  </p>
                  <p className="text-[12px] text-[#666666] font-light tracking-wide">
                    <span className="text-[#888888] font-medium">{win.assigneeName}</span> · {formatRelativeTime(win.completedAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
