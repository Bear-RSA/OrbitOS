"use client";

import { Users } from "lucide-react";
import { TeamWorkloadItem } from "@/types/dashboard";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/classnames";

interface TeamWorkloadCardProps {
  workload: TeamWorkloadItem[];
}

export function TeamWorkloadCard({ workload }: TeamWorkloadCardProps) {
  const activeMembers = workload.filter((m) => m.activeTasks > 0);

  return (
    <div className="rounded-[24px] p-8 sm:p-10 animate-fade-in bg-[#0A0A0A] hover:bg-[#111111] hover:-translate-y-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ring-1 ring-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] w-full">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#888888] mb-10 flex items-center gap-2">
        <Users className="w-3.5 h-3.5 opacity-60" />
        Current Workload
      </h3>
      
      {activeMembers.length === 0 ? (
        <div className="py-4 space-y-2">
           <p className="text-[15px] font-medium text-[#ededed]">Network idle.</p>
           <p className="text-[14px] text-[#888888] font-light leading-relaxed">Assign tasks to operators to map workload distribution.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10">
          {activeMembers.map((member) => (
            <div key={member.memberId} className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#151515] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0">
                  <span className="text-[13px] font-medium text-[#ededed]">
                    {member.memberName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[14px] font-medium text-[#ededed] leading-tight">
                    {member.memberName}
                  </span>
                  <span className="text-[11px] text-[#666666] font-medium uppercase tracking-widest mt-0.5">
                    {member.activeTasks} active task{member.activeTasks !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              
              <div className="pl-11 space-y-2.5">
                {member.tasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="flex flex-col gap-1">
                    <p className="text-[13px] text-[#888888] truncate font-light leading-snug">
                      {task.title}
                    </p>
                    {task.dueDate && (
                      <span
                        className={cn(
                          "text-[10px] font-medium uppercase tracking-wider flex-shrink-0",
                          task.dueDate.toDate() < new Date()
                            ? "text-[#E57A7A]"
                            : "text-[#555555]"
                        )}
                      >
                        {formatDate(task.dueDate.toDate())}
                      </span>
                    )}
                  </div>
                ))}
                {member.tasks.length > 3 && (
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#444444] pt-1">
                    +{member.tasks.length - 3} additional
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
