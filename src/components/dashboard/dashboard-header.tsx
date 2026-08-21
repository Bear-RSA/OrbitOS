"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Member } from "@/types/member";
import { cn } from "@/lib/utils/classnames";
import { Crown, Users } from "lucide-react";
import { getTeamDailyMessage } from "@/utils/dailyMessage";
import { useAuth } from "@/contexts/auth-context";
import { resolvePreferences } from "@/types/preferences";

interface DashboardHeaderProps {
  currentUser: Member;
  orgName: string;
}

export function DashboardHeader({ currentUser, orgName }: DashboardHeaderProps) {
  const { user } = useAuth();
  const { clock24h } = resolvePreferences(user?.preferences);
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
    <div className="animate-fade-in flex flex-col justify-between gap-8 md:flex-row md:items-end">
      <div className="flex min-w-0 flex-col">
        {/* Role Badge */}
        <div className="mb-5 flex items-center gap-3">
          <div className="inline-flex items-center gap-2 text-[11px] font-medium text-ink">
            {currentUser.role === "OWNER" ? (
              <Crown className="h-3.5 w-3.5 text-ink-dim" aria-hidden />
            ) : (
              <Users className="h-3.5 w-3.5 text-ink-dim" aria-hidden />
            )}
            <span className="capitalize tracking-wide">{currentUser.role.toLowerCase()}</span>
          </div>
        </div>

        {/* Greeting */}
        <h1 className="text-[clamp(1.875rem,5vw,2.5rem)] font-light leading-[1.08] tracking-tight text-ink-muted">
          {greeting}, <span className="text-ink-strong">{firstName}</span>.
        </h1>

        {/* Subline */}
        <p className="mt-3.5 max-w-lg text-[14px] font-light leading-relaxed text-ink-muted">
          {currentUser.role === "OWNER"
            ? "Telemetry is active. Here is the operational state of your workspace modules."
            : "Here is your assigned work and project activity."}
        </p>

        {/* Daily Message */}
        <div className="mt-4 flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          <span className="h-1 w-1 shrink-0 rounded-full bg-orbit-green/70" aria-hidden />
          {getTeamDailyMessage(currentUser.orgId)}
        </div>
      </div>

      {/* Clock */}
      <div className="flex shrink-0 select-none flex-col gap-1.5 font-mono md:items-end">
        <div className="text-[22px] font-light leading-none tracking-tight text-ink-muted tabular-nums">
          {format(time, clock24h ? "HH" : "hh")}
          <span className={cn("transition-opacity duration-200", colonVisible ? "opacity-100" : "opacity-30")}>:</span>
          {format(time, "mm")}
          <span className={cn("transition-opacity duration-200", colonVisible ? "opacity-100" : "opacity-30")}>:</span>
          {format(time, "ss")}
          {!clock24h && (
            <span className="ml-1.5 text-[13px] uppercase tracking-[0.1em] text-ink-dim">
              {format(time, "a")}
            </span>
          )}
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          {format(time, "EEEE, d MMMM yyyy")}
        </div>
      </div>
    </div>
  );
}
