"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getProjectPulseAction } from "@/app/actions/pulse";
import { useActivityStream } from "@/hooks/use-activity-stream";
import { formatDistanceToNow } from "date-fns";
import { Activity, Clock, Users, HardDrive, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import { Member } from "@/types/member";
import { CardEyebrow } from "@/components/dashboard/dashboard-card";
import { ScrambleText } from "@/components/ui/scramble-text";

interface PulseData {
  healthScore: number;
  activeUsers: { name: string; uid: string }[];
  activityHotspots: string[];
  storageVelocity: string;
  earliestDue: string | null;
}

/**
 * Health verdict derived from the score.
 *
 * This used to render a hardcoded "NOMINAL" chip regardless of the number
 * beside it, so a project at 12% health still reported itself as healthy.
 */
function healthVerdict(score: number) {
  if (score >= 75) return { label: "Nominal", text: "text-orbit-green", fill: "bg-orbit-green" };
  if (score >= 40) return { label: "Watch", text: "text-orbit-amber", fill: "bg-orbit-amber" };
  return { label: "Critical", text: "text-orbit-red", fill: "bg-orbit-red" };
}

/** Panel header: icon + eyebrow, one treatment for all four cells. */
function CellLabel({ icon: Icon, children }: { icon: typeof Activity; children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
      <CardEyebrow>{children}</CardEyebrow>
    </div>
  );
}

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

  // SSE-driven refresh: re-fetch pulse whenever the project logs an event.
  // Keyed off `total` — the server's lifetime count — rather than the length
  // of the delivered window, which is capped and so stops changing once the
  // project is busy enough, silently freezing the pulse.
  const { total } = useActivityStream({ projectId });

  useEffect(() => {
    if (total !== lastEventCountRef.current && total > 0) {
      lastEventCountRef.current = total;
      fetchPulse();
    }
  }, [total, fetchPulse]);

  /* Same surface recipe as the loaded state, so the panel does not change
     shape or weight when the data arrives. */
  const shell =
    "relative w-full overflow-hidden rounded-3xl bg-surface-card ring-1 ring-inset ring-line/[0.06] " +
    "shadow-card mb-12";

  if (isLoading || !pulse) {
    return (
      <div className={cn(shell, "flex h-28 items-center justify-center")}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-line/[0.07] to-transparent" />
        <span className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
          <Activity className="h-3.5 w-3.5 animate-pulse text-ink-faint" aria-hidden />
          <ScrambleText text="Initializing System Pulse..." />
        </span>
      </div>
    );
  }

  const barLength = 20;
  const filledCount = Math.round((pulse.healthScore / 100) * barLength);
  const verdict = healthVerdict(pulse.healthScore);

  // Horizon Calculation
  let horizonDisplay = "No horizon";
  let horizonOverdue = false;
  if (pulse.earliestDue) {
    const horizonDate = new Date(pulse.earliestDue);
    if (horizonDate < new Date()) {
      horizonDisplay = "Overdue";
      horizonOverdue = true;
    } else {
      horizonDisplay = formatDistanceToNow(horizonDate, { addSuffix: false });
    }
  }

  const isVelocityPositive = pulse.storageVelocity.includes("+");
  const isVelocityNegative = pulse.storageVelocity.includes("-");

  return (
    <div className={cn(shell, "group flex flex-col md:flex-row")}>
      {/* Top-edge light catch — matches every dashboard panel */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-line/[0.07] to-transparent" />

      {/* SYSTEM HEALTH */}
      <div className="flex flex-1 flex-col justify-between border-b border-line/[0.06] p-6 transition-colors duration-500 hover:bg-surface-sunken md:border-b-0 md:border-r">
        <CellLabel icon={Activity}>System Health</CellLabel>
        <div>
          <div className="mb-4 flex items-end gap-3">
            <span className="text-[clamp(2rem,3.5vw,2.5rem)] font-extralight leading-none tracking-tight tabular-nums text-ink">
              {pulse.healthScore}%
            </span>
            <span className={cn("mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]", verdict.text)}>
              <span className="relative flex h-1.5 w-1.5">
                <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", verdict.fill)} />
                <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", verdict.fill)} />
              </span>
              {verdict.label}
            </span>
          </div>

          <div
            className="flex h-1 w-full items-center gap-[2px]"
            role="progressbar"
            aria-valuenow={pulse.healthScore}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Project health"
          >
            {Array.from({ length: barLength }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-full flex-1 rounded-full transition-all duration-1000",
                  i < filledCount ? verdict.fill : "bg-surface-hover"
                )}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 divide-y divide-line/[0.06] border-b border-line/[0.06] sm:grid-cols-2 sm:divide-x sm:divide-y-0 md:border-b-0 md:border-r">
        {/* NETWORK */}
        <div className="group/nodes relative flex flex-col justify-between p-6 transition-colors duration-500 hover:bg-surface-sunken">
          <CellLabel icon={Users}>Network</CellLabel>
          <div>
            <span className="flex items-center gap-2.5 font-mono text-[13px] tracking-[0.08em] text-ink">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink-strong opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-ink-strong" />
              </span>
              {pulse.activeUsers.length} online
            </span>
          </div>

          {/* Hover roster */}
          <div className="pointer-events-none absolute left-6 top-full z-50 mt-2 w-56 translate-y-2 rounded-xl border border-line/10 bg-surface-raised/95 p-4 opacity-0 shadow-raised backdrop-blur-xl transition-all duration-300 group-hover/nodes:translate-y-0 group-hover/nodes:opacity-100">
            <span className="mb-3 block border-b border-line/[0.06] pb-2">
              <CardEyebrow>Active Personnel</CardEyebrow>
            </span>
            {pulse.activeUsers.length === 0 ? (
              <span className="flex items-center gap-2 font-mono text-[10px] text-ink-dim">
                <span className="h-1.5 w-1.5 rounded-full bg-orbit-red/50" />
                No signal
              </span>
            ) : (
              <ul className="space-y-2.5">
                {pulse.activeUsers.map((user) => {
                  const m = members.find((x) => x.id === user.uid);
                  const isOwner = m?.role === "OWNER";
                  const roleAlias = m?.roleDescriptor ?? (isOwner ? "Owner" : "Member");
                  return (
                    <li
                      key={user.uid}
                      className="flex items-center justify-between gap-3 truncate font-mono text-[11px] text-ink"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            isOwner ? "bg-ink" : "bg-orbit-green"
                          )}
                        />
                        <span className="truncate">{user.name}</span>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-[9px] uppercase tracking-[0.14em]",
                          isOwner ? "text-ink-muted" : "text-ink-dim"
                        )}
                      >
                        {roleAlias}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* HORIZON */}
        <div className="flex flex-col justify-between p-6 transition-colors duration-500 hover:bg-surface-sunken">
          <CellLabel icon={Clock}>Horizon</CellLabel>
          <div>
            <span
              className={cn(
                "block font-mono text-[13px] tracking-[0.08em]",
                horizonOverdue ? "text-orbit-red" : "text-ink"
              )}
            >
              {horizonDisplay}
            </span>
          </div>
        </div>
      </div>

      {/* MEMORY VELOCITY & HOTSPOTS */}
      <div className="flex flex-1 flex-col justify-between p-6 transition-colors duration-500 hover:bg-surface-sunken">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <HardDrive className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
            <CardEyebrow>Memory Velocity</CardEyebrow>
          </div>

          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] tabular-nums ring-1 ring-inset",
              isVelocityPositive
                ? "bg-orbit-green/[0.08] text-orbit-green ring-orbit-green/20"
                : isVelocityNegative
                  ? "bg-orbit-red/[0.08] text-orbit-red ring-orbit-red/20"
                  : "bg-surface-control text-ink-muted ring-line/[0.08]"
            )}
          >
            {pulse.storageVelocity}
            {isVelocityPositive && <ArrowUpRight className="h-3 w-3" aria-hidden />}
            {isVelocityNegative && <ArrowDownRight className="h-3 w-3" aria-hidden />}
          </span>
        </div>

        <div>
          <span className="mb-2.5 block">
            <CardEyebrow>Sector Hotspots · 24h</CardEyebrow>
          </span>
          {pulse.activityHotspots.length === 0 ? (
            <span className="font-mono text-[10px] text-ink-dim">No activity traces</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pulse.activityHotspots.map((hs, idx) => (
                <span
                  key={idx}
                  className="max-w-full truncate rounded-md bg-surface-raised px-2 py-1 font-mono text-[10px] tracking-wide text-ink-muted ring-1 ring-inset ring-line/[0.06]"
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
