"use client";

import { useEffect, useId, useState } from "react";
import { Task } from "@/types/task";
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import { DashboardCard, CardHeader, StatusChip } from "./dashboard-card";
import { themeColor } from "@/lib/theme/colors";

interface SystemHealthCardProps {
  tasks: Task[];
  hasProject: boolean;
}

export function SystemHealthCard({ tasks, hasProject }: SystemHealthCardProps) {
  if (!hasProject) {
    return (
      <DashboardCard className="h-full">
        <CardHeader title="Workspace health" icon={Activity} />
        <div className="flex flex-1 flex-col justify-end space-y-2">
          <p className="text-[15px] font-medium text-ink">No tasks to assess yet.</p>
          <p className="text-[13px] font-light leading-relaxed text-ink-muted">
            System health intelligence appears once work is actively tracked.
          </p>
        </div>
      </DashboardCard>
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
    healthy: { label: "Healthy", icon: TrendingUp, tone: "positive" as const, bar: themeColor.green },
    watch: { label: "Watch", icon: Minus, tone: "warning" as const, bar: themeColor.amber },
    "at-risk": { label: "At Risk", icon: TrendingDown, tone: "critical" as const, bar: themeColor.red }
  }[status];

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  // One bar split by status reads as "where the workspace's work sits" at a
  // glance; three loose percentages next to each other never did.
  const segments = [
    { label: "Done", count: done, pct: pct(done), color: themeColor.green },
    { label: "In progress", count: inProgress, pct: pct(inProgress), color: themeColor.blue },
    { label: "To do", count: todo, pct: pct(todo), color: themeColor.inkFaint },
  ];

  return (
    <DashboardCard className="h-full">
      <CardHeader
        title="Workspace health"
        icon={Activity}
        meta={<StatusChip label={config.label} icon={config.icon} tone={config.tone} />}
      />

      <div className="flex flex-1 flex-col justify-end gap-6 sm:flex-row sm:items-center sm:gap-6">
        <HealthMoon score={score} label={config.label} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2.5">
            <p className="text-[clamp(2.25rem,4vw,2.75rem)] font-extralight leading-none tracking-tight text-ink tabular-nums">
              {score}
              <span className="text-[0.5em] text-ink-dim">%</span>
            </p>
            <span className="text-[12px] font-medium" style={{ color: config.bar }}>
              {config.label}
            </span>
          </div>

          <div className="mt-5 flex h-1.5 w-full gap-[3px] overflow-hidden rounded-full" aria-hidden>
            {total === 0 ? (
              <span className="h-full w-full rounded-full bg-surface-hover" />
            ) : (
              segments
                .filter((s) => s.count > 0)
                .map((s) => (
                  <span
                    key={s.label}
                    className="h-full rounded-full"
                    style={{ flexGrow: s.count, flexBasis: 0, backgroundColor: s.color }}
                  />
                ))
            )}
          </div>

          <ul className="mt-4 space-y-2">
            {segments.map((s) => (
              <li key={s.label} className="flex items-center gap-3 text-[13px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                <span className="flex-1 text-ink-muted">{s.label}</span>
                <span className="font-mono text-[12px] tabular-nums text-ink-dim">{s.count}</span>
                <span className="w-10 text-right font-mono text-[13px] font-medium tabular-nums text-ink">
                  {s.pct}%
                </span>
              </li>
            ))}
          </ul>

          <p
            className={cn(
              "mt-4 border-t border-line/[0.06] pt-3 text-[12px]",
              overdue > 0 ? "text-orbit-red" : "text-ink-dim"
            )}
          >
            {overdue > 0
              ? `${overdue} overdue, ${overdue * 15} points off the score`
              : "Nothing overdue"}
          </p>
        </div>
      </div>
    </DashboardCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Health moon                                                        */
/*                                                                     */
/*  The score is the moon's phase: the lit share of the disc is the    */
/*  score, so 100% is a full moon and a failing workspace is a thin    */
/*  crescent. On first paint the light sweeps across from new moon to  */
/*  the score.                                                         */
/*                                                                     */
/*  The surface is drawn once and used twice: dimmed under the whole   */
/*  disc for the earthshine on the dark side, then masked to the lit   */
/*  part. Seas and highland mottling come from fixed-seed noise, so    */
/*  every render shows the same face.                                  */
/* ------------------------------------------------------------------ */

const MOON_R = 64;
const MOON_BOX = 168;
/** Picked by eye from a handful of seeds: dark seas across the top, bright highlands below. */
const SEED = 13;

/** Bright young craters: [x, y, radius, opacity]. */
const SPECKS: [number, number, number, number][] = [
  [22, 8, 7, 0.9], [-6, 46, 4, 0.8], [38, -18, 3.5, 0.7], [-34, -26, 3, 0.6], [8, -40, 3, 0.6],
  [-44, 10, 2.5, 0.5], [30, 34, 3, 0.6], [-14, -6, 2.2, 0.5], [48, 6, 2.5, 0.6],
];
/** The ray crater low on the disc, Tycho's spot. Rays are [angle, length]. */
const RAY_ORIGIN = [-6, 46] as const;
const RAYS: [number, number][] = [
  [-0.6, 40], [0.5, 30], [1.2, 22], [2.0, 26], [2.6, 34], [3.75, 44], [4.3, 52], [4.9, 38], [5.5, 46],
];

/**
 * The lit part for a lit share `f`, sunlight from the right. A half disc
 * on the right, closed by the terminator: half an ellipse whose width is
 * |1 − 2f| of the radius, bowing right for a crescent and left for a
 * gibbous moon.
 */
function litPath(f: number) {
  const r = MOON_R;
  if (f >= 0.999) return `M0,${-r}A${r},${r} 0 1,1 0,${r}A${r},${r} 0 1,1 0,${-r}Z`;
  if (f <= 0.001) return "";
  const rx = Math.abs(1 - 2 * f) * r;
  return `M0,${-r}A${r},${r} 0 0,1 0,${r}A${rx},${r} 0 0,${f < 0.5 ? 0 : 1} 0,${-r}Z`;
}

/** Eases the phase up from new moon on first paint, unless motion is reduced. */
function useSweep(target: number) {
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const duration = 1800;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

function HealthMoon({ score, label }: { score: number; label: string }) {
  const id = `moon-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const lit = useSweep(score) / 100;
  const r = MOON_R;
  const half = MOON_BOX / 2;

  return (
    <div
      className="relative mx-auto shrink-0 sm:mx-0"
      style={{ width: MOON_BOX, height: MOON_BOX }}
      role="img"
      aria-label={`Workspace health ${score}%, ${label}: the moon is ${score}% lit`}
    >
      <svg width={MOON_BOX} height={MOON_BOX} viewBox={`${-half} ${-half} ${MOON_BOX} ${MOON_BOX}`} aria-hidden>
        <defs>
          <radialGradient id={`${id}-base`} cx="45%" cy="42%" r="60%">
            <stop offset="0" stopColor="#efefed" />
            <stop offset="0.7" stopColor="#d6d6d3" />
            <stop offset="1" stopColor="#8f8f8c" />
          </radialGradient>
          {/* Seas: low-frequency noise thresholded into dark, ragged-edged plains. */}
          <filter id={`${id}-maria`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves={3} seed={SEED} />
            <feColorMatrix values="0 0 0 0 .24  0 0 0 0 .24  0 0 0 0 .25  5 0 0 0 -2.2" />
            <feGaussianBlur stdDeviation={0.5} />
          </filter>
          <filter id={`${id}-mottle`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves={3} seed={SEED + 20} />
            <feColorMatrix values="0 0 0 0 .2  0 0 0 0 .2  0 0 0 0 .2  1.2 0 0 0 -.45" />
          </filter>
          <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves={1} seed={9} />
            <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .14 0" />
          </filter>
          <radialGradient id={`${id}-speck`}>
            <stop offset="0" stopColor="#fbfbf9" />
            <stop offset="0.4" stopColor="#fbfbf9" stopOpacity={0.5} />
            <stop offset="1" stopColor="#fbfbf9" stopOpacity={0} />
          </radialGradient>
          <radialGradient id={`${id}-limb`} cx="50%" cy="50%" r="50%">
            <stop offset="0.7" stopColor="#000" stopOpacity={0} />
            <stop offset="1" stopColor="#000" stopOpacity={0.35} />
          </radialGradient>
          <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0.62" stopColor="#cfd6e6" stopOpacity={0.08 * lit} />
            <stop offset="1" stopColor="#cfd6e6" stopOpacity={0} />
          </radialGradient>
          <clipPath id={`${id}-disc`}>
            <circle r={r} />
          </clipPath>
          {/* A soft terminator: sunlight fades across the edge, it does not cut. */}
          <filter id={`${id}-soft`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation={1.6} />
          </filter>
          <mask id={`${id}-lit`} maskUnits="userSpaceOnUse" x={-half} y={-half} width={MOON_BOX} height={MOON_BOX}>
            <path d={litPath(lit)} fill="#fff" filter={`url(#${id}-soft)`} />
          </mask>
        </defs>

        <circle r={r * 1.3} fill={`url(#${id}-glow)`} />

        <g id={`${id}-surface`} clipPath={`url(#${id}-disc)`}>
          <circle r={r} fill={`url(#${id}-base)`} />
          <rect x={-r} y={-r} width={r * 2} height={r * 2} filter={`url(#${id}-maria)`} />
          <rect x={-r} y={-r} width={r * 2} height={r * 2} filter={`url(#${id}-mottle)`} />
          {SPECKS.map(([x, y, size, opacity]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r={size} fill={`url(#${id}-speck)`} opacity={opacity} />
          ))}
          <g stroke="#f4f4f2" strokeOpacity={0.1} strokeWidth={0.8} strokeLinecap="round">
            {RAYS.map(([angle, length]) => (
              <line
                key={angle}
                x1={RAY_ORIGIN[0]}
                y1={RAY_ORIGIN[1]}
                x2={RAY_ORIGIN[0] + Math.cos(angle) * length}
                y2={RAY_ORIGIN[1] + Math.sin(angle) * length}
              />
            ))}
          </g>
          <rect x={-r} y={-r} width={r * 2} height={r * 2} filter={`url(#${id}-grain)`} />
          <circle r={r} fill={`url(#${id}-limb)`} />
        </g>

        {/* Earthshine: the whole face, nearly dark, then the lit share on top. */}
        <circle r={r} fill="#0b0b0b" opacity={0.93} />
        <use href={`#${id}-surface`} mask={`url(#${id}-lit)`} />
      </svg>
    </div>
  );
}
