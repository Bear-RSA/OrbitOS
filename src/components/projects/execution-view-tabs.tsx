"use client";

import { LayoutList, CalendarDays, Map, Network } from "lucide-react";
import { cn } from "@/lib/utils/classnames";

export type ExecutionView = "execution" | "calendar" | "strategy" | "personnel";

const VIEWS = [
  { id: "execution", icon: LayoutList, label: "Checklist" },
  { id: "calendar", icon: CalendarDays, label: "Calendar" },
  { id: "strategy", icon: Map, label: "Roadmap" },
  { id: "personnel", icon: Network, label: "Personnel" },
] as const;

/**
 * Execution-scope view switcher.
 *
 * Laid out as a four-column grid below `sm` and as an inline pill from `sm` up.
 * The row form is ~460px wide — wider than a phone's content column — so on a
 * handset it used to push the whole document past the viewport, which is what
 * left every panel on the page clipped with a dead gutter beside it. Stacking
 * the icon over the label lets all four fit the screen width instead.
 */
export function ExecutionViewTabs({
  value,
  onChange,
  className,
}: {
  value: ExecutionView;
  onChange: (view: ExecutionView) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Execution view"
      className={cn(
        "grid w-full grid-cols-4 gap-1 rounded-xl bg-surface-card p-1 ring-1 ring-inset ring-line/[0.06]",
        "sm:flex sm:w-auto sm:items-center",
        className
      )}
    >
      {VIEWS.map(({ id, icon: Icon, label }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg px-1 py-2",
              "font-mono text-[9px] uppercase tracking-[0.08em]",
              "sm:flex-row sm:gap-2 sm:px-3 sm:py-1.5 sm:text-[10px] sm:tracking-[0.18em]",
              "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              active
                ? "bg-surface-hover text-ink ring-1 ring-inset ring-line/[0.09]"
                : "text-ink-dim hover:bg-surface-raised hover:text-ink-muted"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="max-w-full truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
