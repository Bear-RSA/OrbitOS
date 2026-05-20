"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getProjectPulseAction } from "@/app/actions/pulse";
import { useActivityStream } from "@/hooks/use-activity-stream";
import { formatDistanceToNow } from "date-fns";
import { Activity, Clock, Users, HardDrive, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import { Member } from "@/types/member";

interface PulseData {
  healthScore: number;
  activeUsers: { name: string; uid: string }[];
  activityHotspots: string[];
  storageVelocity: string;
  earliestDue: string | null;
}

import { ScrambleText } from "@/components/ui/scramble-text";

export function ProjectPulse({ projectId, members = [] }: { projectId: string; members?: Member[] }) {
  const [pulse, setPulse] = useState<PulseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastEventCountRef = useRef(0);

  const fetchPulse = useCallback(async () => {
    const res = await getProjectPulseAction(projectId);
    if (res.success && res.data) {
      setPulse(res.data);
    }
    setIsLoading(false);
  }, [projectId]);

  // Initial load
  useEffect(() => {
    fetchPulse();
  }, [fetchPulse]);

  // SSE-driven refresh: re-fetch pulse when event count changes
  const { events } = useActivityStream({ projectId });
  
  useEffect(() => {
    if (events.length !== lastEventCountRef.current && events.length > 0) {
      lastEventCountRef.current = events.length;
      fetchPulse();
    }
  }, [events.length, fetchPulse]);

  if (isLoading || !pulse) {
    return (
      <div className="w-full h-24 border border-[#1a1a1a] bg-[#000000] rounded-xl flex items-center justify-center mb-12 shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
         <span className="text-[10px] font-mono text-[#85C89B] uppercase tracking-widest flex items-center gap-2">
           <Activity className="w-4 h-4 animate-pulse" />
           <ScrambleText text="Initializing System Pulse..." />
         </span>
      </div>
    );
  }

  // Health Bar Calculation
  const barLength = 20;
  const filledCount = Math.round((pulse.healthScore / 100) * barLength);

  // Horizon Calculation
  let horizonDisplay = "NO HORIZON";
  if (pulse.earliestDue) {
    const horizonDate = new Date(pulse.earliestDue);
    const now = new Date();
    if (horizonDate < now) {
      horizonDisplay = "OVERDUE";
    } else {
      horizonDisplay = formatDistanceToNow(horizonDate, { addSuffix: false }).toUpperCase();
    }
  }

  const isVelocityPositive = pulse.storageVelocity.includes('+');
  const isVelocityNegative = pulse.storageVelocity.includes('-');
  
  return (
    <div className="w-full bg-[#000000] border border-[#1a1a1a] rounded-xl overflow-hidden mb-12 flex flex-col md:flex-row shadow-[0_4px_24px_rgba(0,0,0,0.6)] relative group">
      
      {/* SYSTEM_HEALTH */}
      <div className="flex-1 p-6 border-b md:border-b-0 md:border-r border-[#1a1a1a] flex flex-col justify-between hover:bg-white/[0.01] transition-colors relative overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-3.5 h-3.5 text-[#85C89B]" />
          <span className="text-[10px] font-mono text-[#555] uppercase tracking-[0.2em] relative top-[1px]">
            System Health
          </span>
        </div>
        <div>
          <div className="flex items-end gap-3 mb-3">
             <span className="text-4xl font-light text-[#ededed] tracking-tighter leading-none">
               {pulse.healthScore}%
             </span>
             <span className="text-[11px] font-mono flex items-center gap-1.5 text-[#85C89B] tracking-widest mb-1">
               <span className="relative flex h-1.5 w-1.5">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#85C89B] opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#85C89B]"></span>
               </span>
               NOMINAL
             </span>
          </div>
          
          <div className="flex items-center gap-[2px] h-1.5 w-full">
            {Array.from({ length: barLength }).map((_, i) => (
              <div 
                 key={i} 
                 className={cn(
                   "h-full flex-1 rounded-[1px] transition-all duration-1000",
                   i < filledCount 
                     ? "bg-[#85C89B] shadow-[0_0_8px_rgba(133,200,155,0.4)]" 
                     : "bg-[#1a1a1a]"
                 )}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#1a1a1a] border-b md:border-b-0 md:border-r border-[#1a1a1a]">
        
        {/* ACTIVE_NODES */}
        <div className="p-6 relative flex flex-col justify-between hover:bg-white/[0.02] cursor-default transition-colors group/nodes">
          <div className="flex items-center gap-2 mb-4">
             <Users className="w-3.5 h-3.5 text-[#888] group-hover/nodes:text-[#ededed] transition-colors" />
             <span className="text-[10px] font-mono text-[#555] uppercase tracking-[0.2em] relative top-[1px] group-hover/nodes:text-[#888] transition-colors">
               Network
             </span>
          </div>
          <div>
            <span className="text-[13px] font-mono text-[#ededed] tracking-widest flex items-center gap-2 font-medium">
              <span className="relative flex h-2 w-2">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60"></span>
                 <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
              [{pulse.activeUsers.length}] NODES ONLINE
            </span>
          </div>

          {/* Hover Tooltip for Nodes */}
          <div className="absolute left-6 top-full mt-2 w-56 bg-black/60 backdrop-blur-xl border border-white/10 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.8)] z-50 opacity-0 pointer-events-none group-hover/nodes:opacity-100 transition-opacity duration-300 p-4 transform translate-y-2 group-hover/nodes:translate-y-0">
             <span className="text-[9px] font-mono text-[#888] uppercase tracking-[0.2em] mb-3 block border-b border-white/5 pb-2">
               Active Personnel
             </span>
             {pulse.activeUsers.length === 0 ? (
               <span className="text-[10px] font-mono text-[#555] flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-red-500/50" />
                 NULL SIGNAL
               </span>
             ) : (
               <ul className="space-y-2.5">
                 {pulse.activeUsers.map((user) => {
                   const m = members.find((x) => x.id === user.uid);
                   let roleAlias = "[MEMBER]";
                   let roleColor = "text-[#888]";
                   let nodeColor = "bg-[#85C89B]"; // Default node color
                   if (m) {
                     if (m.role === "OWNER") { 
                       roleAlias = "[OWNER]"; 
                       roleColor = "text-[#ededed]"; 
                       nodeColor = "bg-[#ededed]"; 
                     }
                     if (m.roleDescriptor) {
                       roleAlias = m.roleDescriptor;
                     }
                   }
                   return (
                     <li key={user.uid} className="text-[11px] font-mono text-[#ededed] truncate flex items-center justify-between gap-3 group/user">
                       <div className="flex items-center gap-2.5 truncate">
                         <span className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor] shrink-0", nodeColor, roleColor === "text-[#ededed]" ? "text-[#ededed]" : "text-[#85C89B]")} />
                         <span className="truncate group-hover/user:text-white transition-colors">{user.name}</span>
                       </div>
                       <span className={cn("text-[9px] uppercase tracking-[0.15em] shrink-0", roleColor)}>{roleAlias}</span>
                     </li>
                   );
                 })}
               </ul>
             )}
          </div>
        </div>

        {/* DEPLOYMENT_HORIZON */}
        <div 
          onClick={() => console.log("Filtering by Overdue/Horizon")} 
          className="p-6 flex flex-col justify-between hover:bg-white/[0.02] cursor-pointer transition-colors group/horizon"
        >
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-3.5 h-3.5 text-[#888] group-hover/horizon:text-[#ededed] transition-colors" />
            <span className="text-[10px] font-mono text-[#555] uppercase tracking-[0.2em] relative top-[1px] group-hover/horizon:text-[#888] transition-colors">
              Horizon
            </span>
          </div>
          <div>
            <span className={cn(
              "text-[13px] font-mono tracking-widest block font-medium group-hover/horizon:scale-105 origin-left transition-transform duration-300",
              horizonDisplay === "OVERDUE" ? "text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" : "text-[#ededed]"
            )}>
               {horizonDisplay}
            </span>
          </div>
        </div>
      </div>

      {/* STORAGE & ACTIVITY HOTSPOTS */}
      <div className="flex-1 p-6 relative flex flex-col justify-between hover:bg-white/[0.01] transition-colors group/storage">
         <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
               <HardDrive className="w-3.5 h-3.5 text-[#888] group-hover/storage:text-[#ededed] transition-colors" />
               <span className="text-[10px] font-mono text-[#555] uppercase tracking-[0.2em] relative top-[1px] group-hover/storage:text-[#888] transition-colors">
                 Memory Velocity
               </span>
            </div>
            
            <div className={cn(
               "flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded-md border",
               isVelocityPositive ? "text-[#85C89B] border-[#85C89B]/20 bg-[#85C89B]/10" : 
               isVelocityNegative ? "text-red-400 border-red-400/20 bg-red-400/10" : 
               "text-white border-white/20 bg-white/10"
            )}>
               <span>{pulse.storageVelocity}</span>
               {isVelocityPositive && <ArrowUpRight className="w-3 h-3" />}
               {isVelocityNegative && <ArrowDownRight className="w-3 h-3" />}
            </div>
         </div>
         <div className="space-y-2">
           <span className="text-[9px] font-mono text-[#555] uppercase tracking-[0.2em] block mb-2">
             Sector Hotspots (24h)
           </span>
           {pulse.activityHotspots.length === 0 ? (
              <span className="text-[10px] font-mono text-[#444] inline-block mt-1">NO ACTIVITY TRACES</span>
           ) : (
             <div className="flex flex-wrap gap-2">
               {pulse.activityHotspots.map((hs, idx) => (
                 <span 
                    key={idx} 
                    onClick={() => console.log("Navigate or filter by hotspot:", hs)}
                    className="text-[10px] font-mono text-[#a1a1aa] bg-white/[0.02] hover:bg-white/[0.08] hover:text-white cursor-pointer border border-white/5 hover:border-white/20 transition-all duration-300 px-2 py-1 rounded shadow-sm tracking-wide truncate max-w-full"
                 >
                   {hs}
                 </span>
               ))}
             </div>
           )}
         </div>
      </div>

    </div>
  );
}

