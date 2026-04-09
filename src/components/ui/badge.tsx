import * as React from "react";
import { cn } from "@/lib/utils/classnames";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variants = {
      default: "bg-surface-highest/10 text-on-surface-variant border border-on-surface-variant/10",
      secondary: "bg-surface-low text-on-surface-variant border border-outline-variant/10",
      destructive: "bg-destructive/10 text-destructive border border-destructive/10",
      outline: "bg-transparent border border-outline-variant text-on-surface-variant",
      success: "bg-orbit-green/10 text-orbit-green border border-orbit-green/10",
      warning: "bg-orbit-amber/10 text-orbit-amber border border-orbit-amber/10",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-mono tracking-[0.1em] uppercase transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { Badge };
