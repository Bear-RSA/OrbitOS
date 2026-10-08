"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Success modal                                                      */
/*                                                                     */
/*  A rare, high-emotion moment — the one place the delight budget is  */
/*  spent. The badge pops on the bounce curve, the tick draws itself   */
/*  after a beat, and the card leaves the way it arrived instead of    */
/*  vanishing between frames when its timer fires.                     */
/* ------------------------------------------------------------------ */

interface SuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
}

const HOLD_MS = 2000;
/** Matches --t-quick; the exit animation needs to finish before unmount. */
const EXIT_MS = 320;

/** Path length of the tick below (two segments, ~3.5 + ~7.8 units). */
const CHECK_LENGTH = 12;

export function SuccessModal({ open, onOpenChange, title, description }: SuccessModalProps) {
  // Rendered a beat longer than `open` so the exit can play.
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const timer = setTimeout(() => onOpenChange(false), HOLD_MS);
      return () => clearTimeout(timer);
    }
    if (!mounted) return;
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open, mounted, onOpenChange]);

  if (!mounted) return null;

  const state = open ? "open" : "closed";

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center px-4">
      <div
        data-state={state}
        className={cn(
          "absolute inset-0 bg-scrim/40 backdrop-blur-[2px]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-quick",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-quick"
        )}
      />
      <div
        data-state={state}
        role="status"
        className={cn(
          "material-fog-modal relative flex min-w-[300px] flex-col items-center justify-center rounded-2xl border border-line/[0.06] p-8 text-center shadow-overlay ring-1 ring-line/5",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:blur-in-sm",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-quick"
        )}
      >
        {/* Badge pops with a little overshoot — this arrival earned it. */}
        <div
          className={cn(
            "mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-orbit-green/20 bg-orbit-green/10",
            "animate-in zoom-in-75 fade-in-0 duration-spring [animation-timing-function:var(--ease-spring-bounce)]"
          )}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7 text-orbit-green"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <path
              d="m8 12.5 2.5 2.5L16 9.5"
              className="check-draw"
              style={{ "--check-length": CHECK_LENGTH } as React.CSSProperties}
            />
          </svg>
        </div>
        <h3 className="mb-2 text-title-sm font-medium text-ink-strong">{title}</h3>
        {description && (
          <p className="max-w-[240px] text-body-sm font-light text-ink-muted">{description}</p>
        )}
      </div>
    </div>
  );
}
