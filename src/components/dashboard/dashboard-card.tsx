"use client";

import * as React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/classnames";

/**
 * The single surface recipe for every dashboard panel.
 *
 * Before this existed each card mixed its own background (`from-white/[0.02]`,
 * `bg-[#0A0A0A]/50`, `/30`, flat `#0A0A0A`), so panels sitting side by side in
 * the same grid row read as two different components. One recipe, one hover
 * response, one padding scale.
 */
export function DashboardCard({
  className,
  children,
  interactive = true,
  tone = "default",
}: {
  className?: string;
  children: React.ReactNode;
  interactive?: boolean;
  tone?: "default" | "quiet";
}) {
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-3xl",
        "p-6 sm:p-8",
        "ring-1 ring-inset ring-white/[0.06]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_1px_2px_rgba(0,0,0,0.4)]",
        "transition-[background-color,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        tone === "quiet" ? "bg-white/[0.012]" : "bg-white/[0.022]",
        interactive && "hover:bg-white/[0.035] hover:ring-white/[0.09]",
        className
      )}
    >
      {/* Top-edge light catch — gives the surface a direction without a border */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
      {children}
    </div>
  );
}

/**
 * One eyebrow treatment for every panel title. Previously the same semantic
 * element shipped as three different tracking values across two font families.
 */
export function CardEyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] uppercase leading-none tracking-[0.18em] text-ink-dim",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Title row: eyebrow on the left, status/meta or an action on the right. */
export function CardHeader({
  title,
  icon: Icon,
  meta,
  action,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-7 flex items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />}
        <CardEyebrow className="truncate">{title}</CardEyebrow>
      </div>
      {action ?? (meta ? <div className="shrink-0">{meta}</div> : null)}
    </div>
  );
}

/**
 * Numeral + label pair. Keeps the display scale from drifting between
 * 56px / 60px / 40px across panels and guarantees tabular alignment.
 */
export function StatBlock({
  value,
  label,
  size = "lg",
  tone = "default",
  className,
}: {
  value: React.ReactNode;
  label: string;
  size?: "lg" | "md" | "sm";
  tone?: "default" | "idle" | "positive" | "critical";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p
        className={cn(
          "font-extralight leading-none tracking-tight tabular-nums",
          size === "lg" && "text-[clamp(2.5rem,4.5vw,3.25rem)]",
          size === "md" && "text-[clamp(2rem,3.5vw,2.5rem)]",
          size === "sm" && "text-2xl",
          tone === "default" && "text-ink",
          // A zero is still data — it must stay readable, not fade out.
          tone === "idle" && "text-ink-dim",
          tone === "positive" && "text-orbit-green",
          tone === "critical" && "text-orbit-red"
        )}
      >
        {value}
      </p>
      <p className="mt-3 font-mono text-[10px] uppercase leading-none tracking-[0.18em] text-ink-dim">
        {label}
      </p>
    </div>
  );
}

/**
 * Shared pill button used across the dashboard chrome. Replaces the
 * copy-pasted gradient string that appeared in five separate files, and always
 * carries an accessible name — the icon-only variants previously had none.
 */
export function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  collapsed = false,
  variant = "default",
  className,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Renders icon-only until hover/focus, expanding to reveal the label. */
  collapsed?: boolean;
  variant?: "default" | "danger" | "ghost";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "group/btn inline-flex h-9 items-center rounded-lg text-ink",
        "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        variant === "default" &&
          "bg-white/[0.06] ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.1] hover:ring-white/[0.14]",
        variant === "ghost" &&
          "bg-transparent text-ink-muted hover:bg-white/[0.06] hover:text-ink",
        variant === "danger" &&
          "bg-orbit-red/10 text-orbit-red ring-1 ring-inset ring-orbit-red/25 hover:bg-orbit-red/[0.16]",
        collapsed
          ? "w-9 overflow-hidden focus-visible:w-auto hover:w-auto"
          : "gap-2 px-3.5",
        className
      )}
    >
      <span className={cn("flex shrink-0 items-center justify-center", collapsed && "h-9 w-9")}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span
        className={cn(
          "whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em]",
          collapsed &&
            "max-w-0 opacity-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-focus-visible/btn:max-w-[12rem] group-focus-visible/btn:pr-3.5 group-focus-visible/btn:opacity-100 group-hover/btn:max-w-[12rem] group-hover/btn:pr-3.5 group-hover/btn:opacity-100"
        )}
      >
        {label}
      </span>
    </button>
  );
}

/** Semantic status chip — replaces three separate ad-hoc badge implementations. */
export function StatusChip({
  label,
  icon: Icon,
  tone,
  className,
}: {
  label: string;
  icon?: LucideIcon;
  tone: "positive" | "warning" | "critical" | "neutral";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ring-inset",
        tone === "positive" && "bg-orbit-green/[0.08] text-orbit-green ring-orbit-green/20",
        tone === "warning" && "bg-orbit-amber/[0.08] text-orbit-amber ring-orbit-amber/20",
        tone === "critical" && "bg-orbit-red/[0.08] text-orbit-red ring-orbit-red/20",
        tone === "neutral" && "bg-white/[0.05] text-ink-muted ring-white/[0.08]",
        className
      )}
    >
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em]">{label}</span>
    </span>
  );
}

/**
 * Progress track. The old bars were `h-[1px]`/`h-[2px]` with a `bg-[#0A0A0A]`
 * track on a near-identical surface, so neither track nor fill was visible.
 */
export function MeterBar({
  value,
  color,
  className,
}: {
  /** 0–100 */
  value: number;
  color: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-1 w-full overflow-hidden rounded-full bg-white/[0.07]", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ width: `${Math.max(clamped, 2)}%`, backgroundColor: color }}
      />
    </div>
  );
}
