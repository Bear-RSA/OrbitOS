"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import { cn } from "@/lib/utils/classnames";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

/* ------------------------------------------------------------------ */
/*  Reveal-on-scroll                                                   */
/*                                                                     */
/*  Tuned for arrival, not for choreography. The job of this component */
/*  is to make content look placed rather than pasted; anything the    */
/*  operator has to wait through is failing at that. Three rules keep  */
/*  it honest:                                                         */
/*                                                                     */
/*    1. Nothing waits to be looked at. What is already on screen at   */
/*       mount reveals on the first frame -- no observer round-trip.   */
/*    2. Short travel over long travel. 14px reads as settling; the    */
/*       40px this used to run reads as arriving from off-screen.      */
/*    3. No blur. A blurred heading reads as "not loaded yet", which   */
/*       is the exact impression the reveal is supposed to avoid.      */
/* ------------------------------------------------------------------ */

/* `delay` is a sequence hint, not a duration. Call sites pass values up to
   500ms, which at the old 700ms duration meant the last card in a group
   settled 1.2s after entering view. Compressing here keeps the ordering
   every page already expresses without making anyone sit through it. */
const DELAY_SCALE = 0.45;
const DELAY_CAP_MS = 180;

function sequenceDelay(requested: number): number {
  return Math.min(Math.round(requested * DELAY_SCALE), DELAY_CAP_MS);
}

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  yOffset?: number;
  duration?: number;
  once?: boolean;
}

export function ScrollReveal({
  children,
  className,
  delay = 0,
  yOffset = 14,
  duration = 420,
  once = true,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Motion suppressed: the content is the point, so show it and skip the
    // observer entirely. Without this the element still starts at opacity-0
    // and waits on an intersection it does not need.
    if (reducedMotion) {
      setIsVisible(true);
      return;
    }

    // Above-the-fold content reveals on the first frame. This replaces a
    // 100ms setTimeout that used to guard against a blank-on-load bug during
    // route transitions -- measuring directly fixes the same case without
    // spending the wait, and an unsettled layout measures as on-screen,
    // which errs toward showing content rather than hiding it.
    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setIsVisible(true);
      if (once) return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setIsVisible(false);
          }
        });
      },
      {
        root: null,
        // Starts the reveal just before the element clears the fold, so it
        // has finished by the time it is properly in view.
        rootMargin: "0px 0px -32px 0px",
        threshold: 0,
      }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [once, reducedMotion]);

  const settled = isVisible || reducedMotion;

  return (
    <div
      ref={ref}
      className={cn(
        "transition-[opacity,transform] ease-[cubic-bezier(0.16,1,0.3,1)]",
        !settled && "will-change-[opacity,transform]",
        settled ? "opacity-100" : "opacity-0",
        className
      )}
      style={{
        transitionDuration: reducedMotion ? "0ms" : `${duration}ms`,
        transitionDelay: reducedMotion ? "0ms" : `${sequenceDelay(delay)}ms`,
        transform: settled ? "translateY(0)" : `translateY(${yOffset}px)`,
      }}
    >
      {children}
    </div>
  );
}
