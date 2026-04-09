"use client";

import { cn } from "@/lib/utils/classnames";

interface LoaderProps {
  size?: number;
  color?: string;
  stroke?: number;
  speed?: number;
  className?: string;
}

/**
 * Stable Architectural Loader
 * Replaced external 'ldrs' dynamic import with high-fidelity internal SVG
 * to eliminate 'ChunkLoadError' crashes and improve initial render stability.
 * Uses native Tailwind keyframes for motion consistency.
 */
export function Loader({
  size = 24,
  color = "#555555",
  stroke = 2.5,
  speed = 1.5,
  className
}: LoaderProps) {
  return (
    <div className={cn(
      "inline-flex flex-col items-center justify-center animate-in fade-in fill-mode-both duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]", 
      className
    )}>
      <div 
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 100 100"
          className="animate-spin"
          style={{ 
            animationDuration: `${speed}s`,
            width: "100%",
            height: "100%"
          }}
        >
          {/* Background track */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke={color}
            strokeWidth={stroke * 4}
            strokeDasharray="60 180"
            strokeLinecap="round"
            className="opacity-10"
          />
          {/* Active indicator */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke={color}
            strokeWidth={stroke * 4}
            strokeDasharray="120 120"
            strokeLinecap="round"
            style={{
              filter: "drop-shadow(0 0 2px rgba(255,255,255,0.05))"
            }}
          />
        </svg>
        
        {/* Subsurface depth effect */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none rounded-full" />
      </div>
    </div>
  );
}
