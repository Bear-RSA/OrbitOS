import { AlertCircle, Calendar, Clock, Activity } from "lucide-react";
import { cn } from "@/lib/utils/classnames";

/**
 * A static recreation of the real Operational Horizon dashboard for the
 * marketing hero.
 *
 * This deliberately mirrors the live components (`urgency-buckets-card`,
 * `system-health-card`) rather than being an abstract illustration — same
 * eyebrow tracking, same zero-padded mono counts, same red/amber urgency
 * accents. It is markup rather than a screenshot so it stays sharp at any
 * resolution and reflows on small screens instead of being scaled down.
 *
 * The data below is representative sample data, not a real customer workspace.
 */

const BUCKETS = [
  {
    id: "overdue",
    label: "Overdue",
    icon: AlertCircle,
    count: 2,
    accent: "text-orbit-red",
    urgent: true,
    tasks: [
      { name: "Brand Identity v2", meta: "Northbound · 3d late" },
      { name: "Homepage copy deck", meta: "Meridian · 1d late" },
    ],
  },
  {
    id: "dueToday",
    label: "Due Today",
    icon: Clock,
    count: 3,
    accent: "text-orbit-amber",
    urgent: false,
    tasks: [
      { name: "UI Kit audit", meta: "Northbound · 17:00" },
      { name: "Client review pack", meta: "Meridian · 18:30" },
    ],
  },
  {
    id: "dueTomorrow",
    label: "Due Tomorrow",
    icon: Calendar,
    count: 1,
    accent: "text-ink",
    urgent: false,
    tasks: [{ name: "Motion spec sign-off", meta: "Atlas Rebrand" }],
  },
  {
    id: "dueThisWeek",
    label: "Due This Week",
    icon: Calendar,
    count: 4,
    accent: "text-ink-muted",
    urgent: false,
    tasks: [
      { name: "Dev handoff", meta: "Northbound · Fri" },
      { name: "Q3 retainer report", meta: "Meridian · Fri" },
    ],
  },
];

export function HeroProductFrame() {
  return (
    <div className="w-full overflow-hidden rounded-2xl bg-[#0A0A0A] ring-1 ring-white/[0.06] shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
      {/* Window chrome */}
      <div className="flex items-center gap-4 border-b border-white/[0.05] px-4 py-3 sm:px-5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-white/[0.10]" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/[0.10]" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/[0.10]" />
        </div>
        <div className="mx-auto hidden rounded-md bg-white/[0.03] px-3 py-1 font-mono text-[10px] tracking-wider text-[#555555] sm:block">
          orbit-os.co.za/dashboard
        </div>
      </div>

      <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
        {/* Workspace header */}
        <div className="flex items-baseline justify-between gap-4">
          <p className="truncate text-left text-[15px] font-light text-[#ededed] sm:text-lg">
            Good morning, Lerato
          </p>
          <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-[#555555] sm:block">
            Thu 14 Aug · 09:24
          </span>
        </div>

        {/* Operational Horizon */}
        <div className="relative overflow-hidden rounded-2xl bg-white/[0.012] p-4 text-left ring-1 ring-inset ring-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />

          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-[#888888]" aria-hidden />
              <span className="text-[13px] font-light tracking-tight text-[#ededed]">
                Operational Horizon
              </span>
            </div>
            <span className="font-mono text-[10px] uppercase leading-none tracking-[0.18em] text-orbit-amber">
              5 requiring attention
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-4">
            {BUCKETS.map((bucket, idx) => {
              const Icon = bucket.icon;
              return (
                <div
                  key={bucket.id}
                  className={cn(
                    "flex flex-col gap-4",
                    "lg:px-5",
                    idx !== 0 && "lg:border-l lg:border-white/[0.06]",
                    idx === 0 && "lg:pl-0",
                    idx === BUCKETS.length - 1 && "lg:pr-0"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon className={cn("h-3.5 w-3.5 shrink-0", bucket.accent)} aria-hidden />
                      <span className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-[#A1A1A1]">
                        {bucket.label}
                      </span>
                      {bucket.urgent && (
                        <span
                          className="urgency-breath h-1.5 w-1.5 shrink-0 rounded-full bg-orbit-red"
                          aria-hidden
                        />
                      )}
                    </div>
                    <span className={cn("font-mono text-[13px] tabular-nums", bucket.accent)}>
                      {bucket.count.toString().padStart(2, "0")}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {bucket.tasks.map((task) => (
                      <div
                        key={task.name}
                        className="rounded-lg bg-white/[0.02] px-3 py-2.5 ring-1 ring-inset ring-white/[0.03]"
                      >
                        <p className="truncate text-[12px] font-medium text-[#ededed]">
                          {task.name}
                        </p>
                        <p className="mt-1 truncate font-mono text-[10px] text-[#6E6E6E]">
                          {task.meta}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Secondary row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          <div className="relative overflow-hidden rounded-2xl bg-white/[0.022] p-4 text-left ring-1 ring-inset ring-white/[0.06] sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-[#888888]" aria-hidden />
              <span className="text-[13px] font-light tracking-tight text-[#ededed]">
                System Health
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-3xl font-light tabular-nums text-[#ededed]">75</span>
              <span className="rounded-full bg-orbit-amber/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-orbit-amber">
                Watch
              </span>
            </div>
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full w-[75%] rounded-full bg-[#ededed]/70" />
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-white/[0.022] p-4 text-left ring-1 ring-inset ring-white/[0.06] sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6E6E6E]">
                Team Workload
              </span>
            </div>
            <div className="space-y-3">
              {[
                { name: "Thandi M.", load: 92, tone: "bg-orbit-red/70" },
                { name: "Sipho D.", load: 64, tone: "bg-[#ededed]/50" },
                { name: "Anke V.", load: 38, tone: "bg-[#ededed]/30" },
              ].map((member) => (
                <div key={member.name} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 truncate text-[12px] font-light text-[#A1A1A1]">
                    {member.name}
                  </span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className={cn("h-full rounded-full", member.tone)}
                      style={{ width: `${member.load}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono text-[10px] tabular-nums text-[#6E6E6E]">
                    {member.load}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
