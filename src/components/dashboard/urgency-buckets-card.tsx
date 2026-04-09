"use client";

import { Task } from "@/types/task";
import { UrgencyBuckets } from "@/types/dashboard";
import { Project } from "@/types/project";
import { cn } from "@/lib/utils/classnames";
import { Clock, Calendar, AlertCircle, Inbox } from "lucide-react";
import { format } from "date-fns";

interface UrgencyBucketsCardProps {
  buckets: UrgencyBuckets;
  projects?: Project[];
}

export function UrgencyBucketsCard({ buckets, projects = [] }: UrgencyBucketsCardProps) {
  const categories = [
    { id: 'overdue', label: 'Overdue', tasks: buckets.overdue, icon: AlertCircle, color: 'text-orbit-red', countColor: 'text-orbit-red', bgHover: 'hover:bg-orbit-red/[0.03]', isUrgent: true },
    { id: 'dueToday', label: 'Due Today', tasks: buckets.dueToday, icon: Clock, color: 'text-[#ededed]', countColor: 'text-[#ededed]', bgHover: 'hover:bg-white/[0.02]', isUrgent: false },
    { id: 'dueTomorrow', label: 'Due Tomorrow', tasks: buckets.dueTomorrow, icon: Calendar, color: 'text-[#777777]', countColor: 'text-[#777777]', bgHover: 'hover:bg-white/[0.015]', isUrgent: false },
    { id: 'dueThisWeek', label: 'Due This Week', tasks: buckets.dueThisWeek, icon: Calendar, color: 'text-[#444444]', countColor: 'text-[#444444]', bgHover: 'hover:bg-white/[0.01]', isUrgent: false },
  ];

  const totalUrgent = buckets.overdue.length + buckets.dueToday.length;

  return (
    <div className="rounded-[24px] p-10 animate-fade-in bg-[#0A0A0A]/30 ring-1 ring-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.01)] group/card transition-all duration-500 hover:bg-[#0A0A0A]/50">
      <div className="flex items-center justify-between mb-12">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.3em] text-[#444444] flex items-center gap-3">
          <Clock className="w-3.5 h-3.5 text-[#333333]" />
          Operational Horizon
        </h3>
        {totalUrgent > 0 && (
          <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#333333]">
            {totalUrgent} requiring attention
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 relative gap-y-8">
        {categories.map((cat, idx) => (
          <div key={cat.id} className={cn(
            "flex flex-col gap-6 px-0 lg:px-7 py-3 rounded-xl transition-all duration-500",
            idx !== 0 && "lg:border-l lg:border-white/[0.03]",
            idx === 0 && "lg:pl-0",
            cat.bgHover
          )}>
            {/* Bucket Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {cat.isUrgent && cat.tasks.length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-orbit-red/70 urgency-breath flex-shrink-0" />
                )}
                <span className={cn("text-[10px] font-mono tracking-[0.2em] uppercase", cat.color)}>
                  {cat.label}
                </span>
              </div>
              <span className={cn(
                "text-[13px] font-mono tabular-nums transition-all duration-500",
                cat.tasks.length > 0 ? cat.countColor : "text-[#222222]"
              )}>
                {cat.tasks.length.toString().padStart(2, '0')}
              </span>
            </div>

            {/* Task Items */}
            <div className="space-y-3.5 min-h-[72px]">
              {cat.tasks.length === 0 ? (
                <div className="h-[72px] flex items-center justify-center rounded-lg border border-dashed border-white/[0.03] opacity-20">
                   <Inbox className="w-3.5 h-3.5 text-[#555555]" />
                </div>
              ) : (
                cat.tasks.slice(0, 3).map((task, taskIdx) => {
                  const projectName = projects.find(p => p.id === task.projectId)?.name || "Unknown Project";
                  let dueStatusStr = "No signal";
                  if (task.dueDate) {
                    if (cat.id === 'overdue') {
                      const diffTime = Math.abs(new Date().getTime() - task.dueDate.toDate().getTime());
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      dueStatusStr = `Overdue by ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
                    } else if (cat.id === 'dueToday') {
                      dueStatusStr = "Due Today";
                    } else if (cat.id === 'dueTomorrow') {
                      dueStatusStr = "Due Tomorrow";
                    } else {
                      dueStatusStr = `Due ${format(task.dueDate.toDate(), "MMM dd")}`;
                    }
                  }

                  return (
                    <div
                      key={task.id}
                      className="group/task cursor-pointer transition-all duration-300 rounded-md px-2 py-1.5 -mx-2 hover:bg-white/[0.02]"
                      style={{ animationDelay: `${taskIdx * 80}ms` }}
                    >
                      <p className={cn(
                        "text-[13px] font-medium leading-tight truncate transition-colors duration-300",
                        cat.isUrgent ? "text-[#ddd] group-hover/task:text-white" : "text-[#bbb] group-hover/task:text-[#ededed]"
                      )}>
                        {task.title}
                      </p>
                      <p className="text-[10px] mt-1 font-mono tracking-wider truncate flex items-center gap-1.5">
                        <span className="text-[#666666] group-hover/task:text-[#888888] transition-colors duration-300 uppercase">
                          {projectName}
                        </span>
                        <span className="text-[#444444]">•</span>
                        <span className={cn(
                          "transition-colors duration-300 uppercase",
                          cat.id === 'overdue' ? "text-orbit-red/80 group-hover/task:text-orbit-red" : 
                          cat.id === 'dueToday' ? "text-amber-500/80 group-hover/task:text-amber-500" :
                          cat.isUrgent ? "text-[#555555] group-hover/task:text-[#777]" : "text-[#444444] group-hover/task:text-[#555]"
                        )}>
                          {dueStatusStr}
                        </span>
                      </p>
                    </div>
                  );
                })
              )}
              {cat.tasks.length > 3 && (
                <p className="text-[9px] text-[#333333] font-mono uppercase tracking-[0.2em] pt-1 px-2">
                  +{cat.tasks.length - 3} more
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
