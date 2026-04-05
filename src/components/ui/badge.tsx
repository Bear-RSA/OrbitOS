import * as React from "react";
import { cn } from "@/lib/utils/classnames";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variants = {
      default: "bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] text-[#ededed]",
      secondary: "bg-[#1A1A1A] text-[#888888] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
      destructive: "bg-[#1A0A0A] text-[#E57A7A] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
      outline: "ring-1 ring-white/[0.06] text-[#888888]",
      success: "bg-[#0F1A13] text-[#85C89B] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
      warning: "bg-[#1A150A] text-[#E5B567] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wider uppercase transition-colors",
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
