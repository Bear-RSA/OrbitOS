"use client";

import * as React from "react";
import { cn } from "@/lib/utils/classnames";

type InteractiveCardProps = {
  children: React.ReactNode;
  className?: string;
};

export function InteractiveCard({
  children,
  className,
}: InteractiveCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);

  const [isTracking, setIsTracking] = React.useState(false);

  React.useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || 
          window.matchMedia("(pointer: coarse)").matches) return;

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
  }, [isTracking]);

  return (
    <div
      ref={cardRef}
      className={cn(
        "focus-item group relative overflow-hidden rounded-[32px] bg-surface-lowest transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform intent-hover surface-warm",
        !isTracking && "transition-all duration-700", // Smooth reset
        "hover:bg-surface-low hover:shadow-[0_24px_80px_rgba(0,0,0,0.5)] hover:scale-[1.005]",
        className
      )}
      style={{
        transform: `translate(var(--magnetic-x, 0px), var(--magnetic-y, 0px))`
      }}
    >
      {/* Performance-Optimized Cursor Aware Glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000"
        style={{
          background: `radial-gradient(600px circle at var(--mouse-x) var(--mouse-y), rgba(255,255,255,0.03), transparent 70%)`,
        }}
      />

      {/* Surface Depth Shimmer (Tone vs Glow) */}
      <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 bg-gradient-to-tr from-white/[0.01] to-transparent" />

      {/* Content Overlay with Temporal Staggering (Sequence: container -> content) */}
      <div className="relative z-10 transition-opacity duration-500 group-hover:opacity-100 stagger-1">
        {children}
      </div>
    </div>
  );
}
