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
  const [position, setPosition] = React.useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = React.useState(false);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    setPosition({ x, y });
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0A0A0A]",
        "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:-translate-y-4 hover:scale-[1.03] hover:border-[#A078FF]/30",
        "hover:shadow-[0_30px_80px_rgba(0,0,0,0.65)]",
        className
      )}
    >
      {/* Cursor Glow */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500",
          isHovered && "opacity-100"
        )}
        style={{
          background: `radial-gradient(600px circle at ${position.x}% ${position.y}%, rgba(160, 120, 255, 0.22), transparent 40%)`,
        }}
      />

      {/* Secondary highlight */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500",
          isHovered && "opacity-100"
        )}
        style={{
          background: `radial-gradient(300px circle at ${position.x}% ${position.y}%, rgba(255,255,255,0.08), transparent 35%)`,
          mixBlendMode: "screen",
        }}
      />

      {/* Subtle inner surface */}
      <div className="pointer-events-none absolute inset-[1px] rounded-[inherit] bg-gradient-to-b from-white/[0.03] to-transparent opacity-60" />

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
