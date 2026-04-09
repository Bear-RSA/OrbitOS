"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Member } from "@/types/member";
import { cn } from "@/lib/utils/classnames";
import { Crown, Users } from "lucide-react";

interface DashboardHeaderProps {
  currentUser: Member;
  orgName: string;
}

export function DashboardHeader({ currentUser, orgName }: DashboardHeaderProps) {
  const [time, setTime] = useState(new Date());
  const [colonVisible, setColonVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
      setColonVisible((v) => !v);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hour = time.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const firstName = currentUser.name.split(" ")[0];

  return (
    <div className="animate-fade-in flex flex-col md:flex-row md:items-end justify-between gap-8">
      <div className="flex flex-col">
        {/* Role Badge */}
        <div className="flex items-center gap-3 mb-6">
          <div className="px-3 py-1.5 flex items-center gap-2 rounded-md border border-white/[0.04] bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] text-[12px] font-medium text-[#ededed]">
            {currentUser.role === "owner" ? (
              <Crown className="w-3.5 h-3.5 text-[#888888]" />
            ) : (
              <Users className="w-3.5 h-3.5 text-[#888888]" />
            )}
            <span className="capitalize">{currentUser.role}</span>
          </div>
        </div>
        
        {/* Greeting */}
        <h1 className="text-4xl md:text-[44px] font-light text-[#ededed] tracking-tight leading-[1.05]">
          {greeting}, <span className="text-white">{firstName}</span>.
        </h1>
        
        {/* Subline */}
        <p className="text-[14px] text-[#666666] mt-4 font-light max-w-lg leading-relaxed tracking-wide">
          {currentUser.role === "owner"
            ? "Telemetry is active. Here is the operational state of your workspace modules."
            : "Here is your assigned work and project activity."}
        </p>
      </div>

      {/* Clock */}
      <div className="flex flex-col md:items-end gap-1.5 font-mono select-none">
        <div className="text-[28px] font-light text-[#ededed] tabular-nums tracking-tight leading-none">
          {format(time, "HH")}
          <span className={cn("transition-opacity duration-200", colonVisible ? "opacity-100" : "opacity-30")}>:</span>
          {format(time, "mm")}
          <span className={cn("transition-opacity duration-200", colonVisible ? "opacity-100" : "opacity-30")}>:</span>
          {format(time, "ss")}
        </div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#444444]">
          {format(time, "EEEE, d MMMM yyyy")}
        </div>
      </div>
    </div>
  );
}
