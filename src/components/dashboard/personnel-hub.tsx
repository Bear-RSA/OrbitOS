"use client";

import { useEffect, useState, useCallback } from "react";
import { getWorkloadTelemetryAction } from "@/app/actions/personnel";
import { cn } from "@/lib/utils/classnames";
import { Member } from "@/types/member";
import { Task } from "@/types/task";
import { Loader2 } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";

interface PersonnelHubProps {
  projectId: string;
  orgId: string;
  members: Member[];
  tasks: Task[];
  selectedAssignee: string | null;
  onAssigneeSelect: (uid: string | null) => void;
}

export function PersonnelHub({ projectId, orgId, members, tasks, selectedAssignee, onAssigneeSelect }: PersonnelHubProps) {
  const [now, setNow] = useState(Date.now());

  // Heartbeat local timer for offline detection
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000); // Check every 30s
    return () => clearInterval(timer);
  }, []);

  const MAX_SYSTEM_LOAD = 5;

  // Process mapping purely from props for zero-latency reactivity
  const telemetry = members.map(member => {
    const memberId = member.id || (member as any).uid;
    const assignedTasks = tasks.filter(t => t.assignedTo === memberId && t.status !== "done");
    const count = assignedTasks.length;
    let loadPercent = Math.round((count / MAX_SYSTEM_LOAD) * 100);
    if (loadPercent > 100) loadPercent = 100;

    // Heartbeat logic: 5 minute threshold
    let status = member.operationalStatus || "available";
    if (member.lastActivity) {
      const last = member.lastActivity.toDate().getTime();
      const diffMins = (now - last) / (1000 * 60);
      if (diffMins > 5) status = "offline";
    }

    return {
      id: member.id,
      name: member.name,
      photoURL: member.photoURL,
      role: member.role,
      operationalStatus: status,
      directiveCount: count,
      loadPercentage: loadPercent
    };
  }).sort((a, b) => {
    if (a.role !== b.role) return a.role === "OWNER" ? -1 : 1;
    return b.loadPercentage - a.loadPercentage;
  });

  return (
    <div className="bg-[#000000]/40 backdrop-blur-sm border border-[#1a1a1a] rounded-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.8)] ring-1 ring-white/5">
       <div className="p-4 border-b border-white/[0.04] bg-transparent flex justify-between items-center">
          <h2 className="text-[10px] font-mono text-[#555] uppercase tracking-[0.2em]">Personnel Network</h2>
          {selectedAssignee && (
            <button 
              onClick={() => onAssigneeSelect(null)} 
              className="text-[9px] font-mono text-orbit-red border border-orbit-red/30 bg-orbit-red/10 px-2 py-0.5 rounded tracking-widest hover:bg-orbit-red/20 transition-colors"
            >
              Clear Filter
            </button>
          )}
       </div>
       <div className="flex flex-col divide-y divide-[#1a1a1a]">
         {telemetry.map((t) => {
           const isSelected = selectedAssignee === t.id;
           
           // Status mapping
           let statusColor = "bg-[#444]";
           if (t.operationalStatus === "available") statusColor = "bg-[#85C89B]";
           if (t.operationalStatus === "focused") statusColor = "bg-[#ededed]";
           if (t.operationalStatus === "offline") statusColor = "bg-orbit-red";

           // Role formatting
           const roleAlias = t.role === "OWNER" ? "[OWNER]" : "[MEMBER]";
           const roleColor = t.role === "OWNER" ? "text-orbit-red" : "text-[#888]";

           // Load bar
           const barLength = 10;
           const filledCount = Math.round((t.loadPercentage / 100) * barLength);
           const bar = `[${"|".repeat(filledCount)}${"-".repeat(barLength - filledCount)}]`;

           return (
             <div 
               key={t.id}
               onClick={() => onAssigneeSelect(isSelected ? null : t.id)}
               className={cn(
                 "p-4 flex items-center justify-between cursor-pointer group transition-all duration-300",
                 isSelected ? "bg-white/[0.04] ring-inset ring-1 ring-white/10" : "hover:bg-white/[0.02]"
               )}
             >
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <UserAvatar name={t.name} photoURL={t.photoURL} size="sm" />
                    <span className={cn("absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#000]", statusColor)} />
                  </div>
                  <div className="flex flex-col">
                     <span className="text-[13px] font-medium text-[#ededed] tracking-tight group-hover:text-white transition-colors">
                       {t.name}
                     </span>
                     <span className={cn("text-[9px] font-mono tracking-widest uppercase mt-0.5", roleColor)}>
                       {roleAlias}
                     </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                   <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-[0.1em]">
                      <span className="text-[#555]">{t.operationalStatus}</span>
                      <span className="text-[#888]">{bar}</span>
                      <span className={cn("tabular-nums", t.loadPercentage >= 80 ? "text-orbit-red" : "text-[#ccc]")}>
                        {t.directiveCount} NODES
                      </span>
                   </div>
                </div>
             </div>
           );
         })}
       </div>
    </div>
  );
}
