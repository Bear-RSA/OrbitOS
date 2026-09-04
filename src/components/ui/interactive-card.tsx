"use client";

import * as React from "react";
import { cn } from "@/lib/utils/classnames";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type InteractiveCardProps = {
  children: React.ReactNode;
  className?: string;
};

export function InteractiveCard({
  children,
  className,
}: InteractiveCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const [isTracking, setIsTracking] = React.useState(false);

  React.useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    // Never attach the listeners at all when motion is suppressed. CSS can
    // only flatten the easing on this transform, not stop it being written,
    // so leaving the handler live would make the card jump to the cursor
    // instead of gliding to it.
    if (reducedMotion) {
      card.style.setProperty("--magnetic-x", "0px");
      card.style.setProperty("--magnetic-y", "0px");
      // Back to the centred fallback rather than wherever the cursor last
      // left the glow, so the resting state is the same on every card.
      card.style.removeProperty("--card-mouse-x");
      card.style.removeProperty("--card-mouse-y");
      setIsTracking(false);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (window.matchMedia("(pointer: coarse)").matches) return;

      if (!isTracking) setIsTracking(true);
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const moveX = (x - centerX) / 20;
      const moveY = (y - centerY) / 20;

      card.style.setProperty("--magnetic-x", `${(moveX * 0.15).toFixed(2)}px`);
      card.style.setProperty("--magnetic-y", `${(moveY * 0.15).toFixed(2)}px`);

      // Card-local cursor position for the glow below. Deliberately NOT the
      // global `--mouse-x`/`--mouse-y`, which `InteractionProvider` owns as a
      // viewport percentage and `Card` also reads -- overriding those here
      // would hand any nested consumer pixel values it does not expect.
      card.style.setProperty("--card-mouse-x", `${x.toFixed(0)}px`);
      card.style.setProperty("--card-mouse-y", `${y.toFixed(0)}px`);
    };

    const handleMouseLeave = () => {
      setIsTracking(false);
      card.style.setProperty("--magnetic-x", "0px");
      card.style.setProperty("--magnetic-y", "0px");
    };

    card.addEventListener("mousemove", handleMouseMove, { passive: true });
    card.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      card.removeEventListener("mousemove", handleMouseMove);
      card.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [isTracking, reducedMotion]);

  return (
    <div
      ref={cardRef}
      className={cn(
        "focus-item group relative overflow-hidden rounded-[32px] bg-surface-lowest transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform intent-hover surface-warm",
        !isTracking && "transition-all duration-700", // Smooth reset
        "hover:bg-surface-low hover:shadow-[0_24px_80px_rgb(var(--scrim)_/_0.5)] hover:scale-[1.005]",
        className
      )}
      style={{
        transform: `translate(var(--magnetic-x, 0px), var(--magnetic-y, 0px))`
      }}
    >
      {/* Performance-Optimized Cursor Aware Glow.

          This used to read the global `--mouse-x`/`--mouse-y`, which are a
          percentage of the VIEWPORT. Resolved against this box they land on
          the cursor only when the card happens to fill the screen, so the
          glow drifted away from the pointer on every smaller card. The
          card-local pixel values track it properly; 50% keeps the gradient
          centred before the first mousemove, on coarse pointers, and under
          reduced motion, where no handler is attached to update them. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000"
        style={{
          background: `radial-gradient(600px circle at var(--card-mouse-x, 50%) var(--card-mouse-y, 50%), rgb(var(--sheen) / calc(0.03 * var(--sheen-a))), transparent 70%)`,
        }}
      />

      {/* Surface Depth Shimmer (Tone vs Glow) */}
      <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 bg-gradient-to-tr from-sheen/[0.01] to-transparent" />

      {/* Content Overlay with Temporal Staggering (Sequence: container -> content) */}
      <div className="relative z-10 transition-opacity duration-500 group-hover:opacity-100 stagger-1">
        {children}
      </div>
    </div>
  );
}
