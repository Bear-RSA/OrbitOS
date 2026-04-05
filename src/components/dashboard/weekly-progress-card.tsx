"use client";

import { WeeklyProgressDay } from "@/types/dashboard";
import { cn } from "@/lib/utils/classnames";

interface WeeklyProgressCardProps {
  weeklyProgress: WeeklyProgressDay[];
}

export function WeeklyProgressCard({ weeklyProgress }: WeeklyProgressCardProps) {
  const today = new Date();
  const maxCount = Math.max(...weeklyProgress.map((d) => d.count), 1);
  const totalThisWeek = weeklyProgress.reduce((sum, day) => sum + day.count, 0);

  return (
    <div className="rounded-[20px] p-8 animate-fade-in bg-[#0A0A0A] hover:bg-[#111111] hover:-translate-y-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ring-1 ring-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] flex flex-col relative w-full overflow-hidden">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#888888] mb-8">
        This Week
      </h3>
      
      <div className="flex-1 flex flex-col justify-end">
        {totalThisWeek === 0 ? (
          <div className="h-24 flex flex-col justify-end space-y-2 pb-2">
            <p className="text-[14px] font-medium text-[#ededed]">No activity recorded.</p>
            <p className="text-[13px] text-[#888888] font-light leading-relaxed">Complete tasks to visualize operational momentum.</p>
          </div>
        ) : (
          <div className="flex items-end gap-3 h-24 mt-4">
            {weeklyProgress.map((day) => {
              const isToday = day.date.toDateString() === today.toDateString();
              const isFuture = day.date > today;
              const heightPercent = isFuture ? 0 : (day.count / maxCount) * 100;

              return (
                <div key={day.day} className="flex flex-col items-center gap-2.5 flex-1 relative group">
                  {day.count > 0 && !isFuture && (
                    <span className="absolute -top-6 text-[11px] text-[#ededed] tabular-nums font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      {day.count}
                    </span>
                  )}
                  <div className="w-full flex flex-col justify-end h-[60px]">
                    <div
                      className={cn(
                        "w-full rounded-[3px] transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
                        isFuture
                          ? "bg-[#1A1A1A] h-1"
                          : day.count > 0
                          ? isToday
                            ? "bg-[#ededed] shadow-[0_0_12px_rgba(255,255,255,0.2)]"
                            : "bg-[#444444]"
                          : "bg-[#1A1A1A] h-1"
                      )}
                      style={{
                        height: isFuture || day.count === 0 ? undefined : `${Math.max(heightPercent, 12)}%`,
                      }}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase tracking-wider transition-colors",
                      isToday ? "text-[#ededed]" : "text-[#555555]"
                    )}
                  >
                    {day.shortDay}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
