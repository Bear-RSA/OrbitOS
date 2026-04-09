"use client";

import { Task } from "@/types/task";
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import { cn } from "@/lib/utils/classnames";

interface SystemHealthCardProps {
  tasks: Task[];
  hasProject: boolean;
}

export function SystemHealthCard({ tasks, hasProject }: SystemHealthCardProps) {
  if (!hasProject) {
    return (
      <div className="rounded-[24px] p-10 animate-fade-in bg-[#0A0A0A] ring-1 ring-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] flex flex-col relative overflow-hidden">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#555555] mb-8">
          System Health
        </h3>
        <div className="flex-1 flex flex-col justify-end space-y-2">
          <p className="text-[15px] font-medium text-[#ededed]">No tasks to assess yet.</p>
          <p className="text-sm text-[#666666] font-light leading-relaxed">System health intelligence appears once work is actively tracked.</p>
        </div>
      </div>
    );
  }

  const total = tasks.length;
  let score = 100;
  let status: "healthy" | "watch" | "at-risk" = "healthy";
  
  let done = 0;
  let inProgress = 0;
  let todo = 0;
  let overdue = 0;

  if (total > 0) {
    done = tasks.filter(t => t.status === "done").length;
    inProgress = tasks.filter(t => t.status === "doing").length;
    todo = tasks.filter(t => t.status === "todo").length;
    
    overdue = tasks.filter(t => {
      if (!t.dueDate || t.status === "done") return false;
      const due = t.dueDate.toDate();
      const today = new Date();
      today.setHours(0,0,0,0);
      due.setHours(0,0,0,0);
      return due.getTime() < today.getTime();
    }).length;

    const todoPercent = (todo / total) * 100;
    
    let penalty = 0;
    penalty += overdue * 15;
    if (todoPercent > 50) {
      penalty += (todoPercent - 50) * 0.5;
    }
    
    score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  }

  if (score >= 80) status = "healthy";
  else if (score >= 60) status = "watch";
  else status = "at-risk";

  const config = {
    healthy: { label: "Healthy", icon: TrendingUp, textColor: "text-orbit-green", ringColor: "ring-orbit-green/15", bg: "bg-[#0F1A13]", bar: "#85C89B" },
    watch: { label: "Watch", icon: Minus, textColor: "text-orbit-amber", ringColor: "ring-orbit-amber/15", bg: "bg-[#1A180A]", bar: "#E5B567" },
    "at-risk": { label: "At Risk", icon: TrendingDown, textColor: "text-orbit-red", ringColor: "ring-orbit-red/15", bg: "bg-[#1A0A0A]", bar: "#E57A7A" }
  }[status];

  const Icon = config.icon;
  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;
  const doingPct = total > 0 ? Math.round((inProgress / total) * 100) : 0;
  const todoPct = total > 0 ? Math.round((todo / total) * 100) : 0;

  return (
    <div className={cn(
      "rounded-[24px] p-10 animate-fade-in bg-[#0A0A0A]/50 hover:bg-[#0C0C0C] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ring-1 ring-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.01)] flex flex-col relative overflow-hidden group"
    )}>
      <div className="absolute inset-0 bg-white/[0.005] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      
      <div className="flex items-center justify-between mb-12">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#444444]">
          System Health
        </h3>
        <Activity className="w-4 h-4 text-[#333]" />
      </div>
      
      <div className="flex-1 flex flex-col justify-end">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
             <div className="flex items-baseline gap-3 mb-5">
               <p className="text-[40px] font-light text-[#ededed] tracking-tight truncate leading-none">
                 {score}%
               </p>
               <span className="text-[12px] font-mono uppercase tracking-widest text-[#555]">Overall Health</span>
             </div>
             
             <div className="flex items-center gap-5 mt-5">
               <div className="flex items-center gap-2">
                 <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#444444]">Done</span>
                 <span className="text-[13px] font-mono tabular-nums font-medium text-[#ededed]">{donePct}%</span>
               </div>
               <span className="w-px h-3 bg-white/[0.04]" />
               <div className="flex items-center gap-2">
                 <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#444444]">In Progress</span>
                 <span className="text-[13px] font-mono tabular-nums font-medium text-[#ededed]">{doingPct}%</span>
               </div>
               <span className="w-px h-3 bg-white/[0.04]" />
               <div className="flex items-center gap-2">
                 <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#444444]">To Do</span>
                 <span className="text-[13px] font-mono tabular-nums font-medium text-[#ededed]">{todoPct}%</span>
               </div>
               <span className="w-px h-3 bg-white/[0.04]" />
               <div className="flex items-center gap-2">
                 <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#444444]">Overdue Open</span>
                 <span className={cn("text-[13px] font-mono tabular-nums font-medium", overdue > 0 ? "text-orbit-red" : "text-[#ededed]")}>
                   {overdue.toString().padStart(2, '0')}
                 </span>
               </div>
             </div>
             
             {/* Progress Bar (Overall Score) */}
             <div className="mt-8 space-y-3">
               <div className="h-[2px] w-full bg-white/[0.03] overflow-hidden rounded-full">
                 <div 
                   className="h-full rounded-full transition-all duration-1000"
                   style={{ width: `${Math.max(score, 5)}%`, backgroundColor: config.bar }} 
                 />
               </div>
             </div>
          </div>

          <div className="flex-shrink-0">
            <span className={cn(
              "px-3 py-1.5 rounded-md flex items-center ring-1 ring-inset transition-all duration-500",
              config.bg,
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
