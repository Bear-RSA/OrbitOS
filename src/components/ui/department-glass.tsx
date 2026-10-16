import type { CSSProperties, ReactNode } from "react";

import { LucideIcon } from "@/components/ui/lucide-icon";
import { DEPARTMENT_TINTS, type DepartmentTint } from "@/lib/members/department-tint";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Department glass                                                   */
/*                                                                     */
/*  The one skin for a department card, on the Admin Tools canvas and  */
/*  the Teams tree alike: glass shaded with the department's colour,   */
/*  an even wash and a rim in the same colour, and no glow.            */
/*                                                                     */
/*  Everyone wired into the department wears a lighter shade of the    */
/*  same colour (`departmentShade`), so a team reads as one block.     */
/*                                                                     */
/*  The colour rides in one CSS variable, `--tint`, so every class     */
/*  here is static and Tailwind can see it.                            */
/* ------------------------------------------------------------------ */

export function tintStyle(tint: DepartmentTint): CSSProperties {
  return { ["--tint" as string]: DEPARTMENT_TINTS[tint].rgb };
}

export function DepartmentGlass({
  tint,
  className,
  children,
  highlighted = false,
}: {
  tint: DepartmentTint;
  className?: string;
  children: ReactNode;
  /** A stronger rim, e.g. while something is dragged over it. */
  highlighted?: boolean;
}) {
  return (
    <div
      style={tintStyle(tint)}
      className={cn(
        "relative isolate overflow-hidden rounded-[24px] bg-surface-control backdrop-blur-md",
        "ring-1 ring-inset transition-[box-shadow] duration-quick ease-spring",
        highlighted ? "ring-[rgb(var(--tint)/0.6)]" : "ring-[rgb(var(--tint)/0.24)]",
        "shadow-[0_8px_24px_-14px_rgb(0_0_0/0.45),inset_0_1px_0_rgb(255_255_255/0.08)]",
        className
      )}
    >
      {/* The shade: an even wash of the colour, a touch deeper at the top. No glow. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(var(--tint)/0.16)_0%,rgb(var(--tint)/0.09)_100%)]"
      />
      {children}
    </div>
  );
}

/**
 * The lighter shade a person's card wears when they are in a department.
 * Spread `style` and add `className` to the card; nothing when they're in none.
 */
export function departmentShade(tint: DepartmentTint | null): { style?: CSSProperties; className: string } {
  if (!tint) return { className: "" };
  return {
    style: tintStyle(tint),
    className:
      "bg-[linear-gradient(180deg,rgb(var(--tint)/0.10)_0%,rgb(var(--tint)/0.05)_100%)] ring-[rgb(var(--tint)/0.22)]",
  };
}

/**
 * The department's icon, any Lucide name, in a tile tinted to match. Sits
 * inside `DepartmentGlass`. No icon, or one Lucide lacks, draws the default mark.
 */
export function DepartmentIcon({ icon, className }: { icon?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]",
        "bg-[rgb(var(--tint)/0.18)] text-[rgb(var(--tint))] ring-1 ring-inset ring-[rgb(var(--tint)/0.35)]",
        className
      )}
    >
      <LucideIcon icon={icon} className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

/** A small pill in the department's colour, for counts. */
export function TintPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full bg-[rgb(var(--tint)/0.16)] px-2 py-0.5 font-mono text-[11px] tabular-nums text-ink ring-1 ring-inset ring-[rgb(var(--tint)/0.3)]",
        className
      )}
    >
      {children}
    </span>
  );
}
