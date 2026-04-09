import * as React from "react";
import { cn } from "@/lib/utils/classnames";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-lg bg-surface-lowest border-0 px-4 py-2 text-[14px] text-on-surface transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] placeholder:text-on-surface-variant/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/20 focus-visible:bg-surface-low disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
