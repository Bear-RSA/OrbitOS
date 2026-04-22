"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { getRoadmapAction, RoadmapItem } from "@/app/actions/roadmap";
import { format, eachMonthOfInterval } from "date-fns";
import { cn } from "@/lib/utils/classnames";
import { Loader2 } from "lucide-react";
import { Task } from "@/types/task";

interface SystemRoadmapProps {
  projectId: string;
  tasks: Task[];
}

export function SystemRoadmap({ projectId, tasks }: SystemRoadmapProps) {
  const [roadmap, setRoadmap] = useState<RoadmapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getRoadmapAction(projectId).then(res => {
      if (res.success && res.data) {
        setRoadmap(res.data);
      }
      setLoading(false);
    });
  }, [projectId, tasks]);

  const { minDateMs, maxDateMs, totalDays, pxPerDay } = useMemo(() => {
    if (roadmap.length === 0) return { minDateMs: Date.now(), maxDateMs: Date.now(), totalDays: 30, pxPerDay: 20 };
    
    let minMs = Math.min(...roadmap.map(rm => rm.startDateMs));
    let maxMs = Math.max(...roadmap.map(rm => rm.horizonDateMs));
    
    const padding = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    minMs = Math.min(minMs, now) - padding;
    maxMs = Math.max(maxMs, now) + padding;

    const totalDaysCount = Math.ceil((maxMs - minMs) / (24 * 60 * 60 * 1000));
    return { minDateMs: minMs, maxDateMs: maxMs, totalDays: totalDaysCount, pxPerDay: 16 };
  }, [roadmap]);

  useEffect(() => {
    if (!loading && containerRef.current && roadmap.length > 0) {
       const todayOffset = ((Date.now() - minDateMs) / (24 * 60 * 60 * 1000)) * pxPerDay;
       const centerOffset = todayOffset - containerRef.current.clientWidth / 2;
       containerRef.current.scrollTo({ left: centerOffset, behavior: 'smooth' });
    }
  }, [loading, minDateMs, pxPerDay, roadmap.length]);

  if (loading) {
    return (
      <div className="h-48 flex items-center justify-center bg-[#000000]/40 backdrop-blur-sm border border-[#1a1a1a] rounded-xl mb-12 ring-1 ring-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
        <Loader2 className="w-5 h-5 text-[#666] animate-spin" />
      </div>
    );
  }

  if (roadmap.length === 0) return null;

  const totalWidth = totalDays * pxPerDay;
  const todayX = ((Date.now() - minDateMs) / (24 * 60 * 60 * 1000)) * pxPerDay;
  const months = eachMonthOfInterval({ start: new Date(minDateMs), end: new Date(maxDateMs) });

  const handleTaskClick = (taskId: string) => {
     const target = document.getElementById(`task-${taskId}`);
     if (target) {
       target.scrollIntoView({ behavior: "smooth", block: "center" });
       target.classList.add("ring-1", "ring-white/30", "transition-all", "duration-500");
       setTimeout(() => target.classList.remove("ring-1", "ring-white/30"), 1500);
     }
  };

  return (
    <div className="bg-[#000000]/40 backdrop-blur-sm border border-[#1a1a1a] rounded-xl overflow-hidden mb-12 flex flex-col shadow-[0_8px_32px_rgba(0,0,0,0.8)] ring-1 ring-white/5 animate-fade-in group/roadmap">
      <div className="p-4 border-b border-white/[0.04] bg-transparent flex items-center justify-between">
         <h2 className="text-[10px] font-mono text-[#555] uppercase tracking-[0.2em] select-none">
           Strategy Viewer // Deployment Roadmap
         </h2>
         <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-orbit-red animate-pulse" />
            <span className="text-[8px] font-mono text-[#444] uppercase tracking-widest">Live Horizon</span>
         </div>
      </div>

      <div className="relative group/scroll-mask">
        <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#050505]/60 to-transparent z-30 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#050505]/60 to-transparent z-30 pointer-events-none" />

        <div 
          ref={containerRef}
          className="relative overflow-x-auto overflow-y-hidden custom-scrollbar select-none cursor-grab active:cursor-grabbing pb-2"
          style={{ height: '340px' }}
          onMouseDown={(e) => {
            const ele = containerRef.current;
            if (!ele) return;
            const startX = e.clientX;
            const scrollLeft = ele.scrollLeft;
            
            const onMouseMove = (ev: MouseEvent) => {
              const dx = ev.clientX - startX;
              ele.scrollLeft = scrollLeft - dx;
            };
            
            const onMouseUp = () => {
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
            };
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          }}
        >
          <div className="relative h-full" style={{ width: `${totalWidth}px` }}>
            {months.map(month => {
              const startX = ((month.getTime() - minDateMs) / (24 * 60 * 60 * 1000)) * pxPerDay;
              return (
                <div key={month.getTime()} className="absolute top-0 bottom-0 border-l border-white/[0.05] pointer-events-none" style={{ left: `${startX}px` }}>
                   <span className="absolute top-2 left-2 text-[9px] font-mono text-[#444] uppercase tracking-widest">{format(month, 'MMM yyyy')}</span>
                </div>
              );
            })}

            <div className="absolute top-0 bottom-0 z-10 w-px bg-orbit-red/30 pointer-events-none" style={{ left: `${todayX}px` }}>
              <div className="absolute top-2 -translate-x-1/2 bg-orbit-red/10 border border-orbit-red/20 text-orbit-red text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded">
                Today
              </div>
            </div>

            <div className="absolute top-12 left-0 right-0 bottom-4 flex flex-col gap-2 py-2 z-20 overflow-y-auto pr-4 custom-scrollbar">
              {roadmap.map((item) => {
                const startX = Math.max(0, ((item.startDateMs - minDateMs) / (24 * 60 * 60 * 1000)) * pxPerDay);
                let width = ((item.horizonDateMs - item.startDateMs) / (24 * 60 * 60 * 1000)) * pxPerDay;
                if (width < pxPerDay * 1.5) width = pxPerDay * 1.5;
                
                const isExecuted = item.isExecuted;
                const isOverdue = item.horizonDateMs < Date.now() && !isExecuted;

                let barColor = "bg-[#111111] border-[#1a1a1a]";
                if (isExecuted) barColor = "bg-[#85C89B]/10 border-[#85C89B]/30";
                else if (isOverdue) barColor = "bg-orbit-red/5 border-orbit-red/30";
                else if (item.status === "doing") barColor = "bg-white/5 border-white/10";

                return (
                  <div key={item.id} className="relative h-8 w-full group flex items-center shrink-0">
                    <div 
                       onClick={() => handleTaskClick(item.id)}
                       className={cn("absolute h-6 rounded-[4px] border cursor-pointer flex items-center px-2 group-hover:ring-1 group-hover:ring-white/10 transition-all z-20", barColor)}
                       style={{ left: `${startX}px`, width: `${width}px` }}
                    >
                      <span className={cn(
                        "text-[9px] font-mono truncate relative z-10 font-medium tracking-tight whitespace-nowrap", 
                        isExecuted ? "text-[#85C89B]" : isOverdue ? "text-orbit-red" : "text-[#888] group-hover:text-[#ededed]"
                      )}>
                        <span className="opacity-50 mr-1.5">#{item.shortId}</span>
                        {item.title}
                      </span>
                    </div>

                    {isOverdue && (
                       <div className="absolute h-[1px] border-t border-dashed border-orbit-red/30 pointer-events-none z-10" style={{ left: `${startX + width}px`, width: `${todayX - (startX + width)}px` }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
