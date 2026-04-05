"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { ProjectProgress } from "@/types/dashboard";
import { InteractiveCard } from "@/components/ui/interactive-card";

interface ProjectProgressCardProps {
  progress: ProjectProgress | null;
  hasProject: boolean;
}

export function ProjectProgressCard({ progress, hasProject }: ProjectProgressCardProps) {
  if (!hasProject || !progress) {
    return (
      <InteractiveCard className="p-8 flex flex-col h-full min-h-[220px] animate-fade-in">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#888888] mb-6">
          Project Progress
        </h3>
        <div className="flex-1 flex flex-col justify-end space-y-2">
          <p className="text-[14px] font-medium text-[#ededed]">No work started yet.</p>
          <p className="text-[13px] text-[#888888] font-light leading-relaxed">Add tasks to begin calculating vector metrics.</p>
        </div>
      </InteractiveCard>
    );
  }

  return (
    <InteractiveCard className="p-8 flex flex-col h-full min-h-[220px] animate-fade-in">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#888888] mb-8">
        Project Progress
      </h3>
      
      <div className="flex-1 flex flex-col justify-end space-y-6">
        <div className="flex items-end justify-between">
          <p className="text-[17px] font-light text-[#ededed] truncate pr-4">{progress.project.name}</p>
          <span className="text-3xl font-light text-[#ededed] tabular-nums tracking-tighter leading-none">
            {progress.percentComplete}<span className="text-xl text-[#666666] ml-0.5">%</span>
          </span>
        </div>
        
        <div className="w-full h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
          <div 
            className="h-full bg-[#ededed] shadow-[0_0_10px_rgba(255,255,255,0.5)] rounded-full transition-all duration-1000 ease-out" 
            style={{ width: `${progress.percentComplete}%` }} 
          />
        </div>
        
        <div className="flex items-center gap-6 text-[13px] text-[#888888]">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-[#ededed]/40" />
            {progress.doneTasks} <span className="font-light">done</span>
          </span>
          <span className="flex items-center gap-2 font-medium">
            <Circle className="w-4 h-4 text-[#333333]" />
            {progress.remainingTasks} <span className="font-light">remaining</span>
          </span>
        </div>
      </div>
    </InteractiveCard>
  );
}
