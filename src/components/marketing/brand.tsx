import type { ReactNode } from "react";
import { OrbitMark } from "@/components/brand/orbit-mark";
import { cn } from "@/lib/utils/classnames";

export { OrbitMark };

/**
 * Brand-kit primitives for the marketing pages (brand-kit/orbitos-marketing-brandkit.png).
 *
 * The system is monochrome with one accent: Signal amber (`orbit-amber`).
 * Amber marks a single point per view — the satellite on the mark, a section
 * index, a status dot. It never fills a surface or carries body text.
 */

/** Wordmark lockup used by the nav and footer. */
export function OrbitLockup({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5 text-ink", className)}>
      <OrbitMark className="h-6 w-6" />
      <span className="text-[17px] font-normal tracking-[-0.02em]">OrbitOS</span>
    </span>
  );
}

/**
 * Small mono label above a heading — the brand board's page-number detail.
 * With `index` it reads "01 — Core Engine" (section label); without, it is
 * led by a single Signal dot (page label, one per hero).
 */
export function Eyebrow({
  index,
  children,
  className,
}: {
  index?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim",
        className
      )}
    >
      {index ? (
        <>
          <span className="tabular-nums text-orbit-amber">{index}</span>
          <span aria-hidden className="h-px w-6 bg-line/[0.14]" />
        </>
      ) : (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-orbit-amber" />
      )}
      {children}
    </span>
  );
}
