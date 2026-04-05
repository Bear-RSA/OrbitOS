import * as React from "react";
import { cn } from "@/lib/utils/classnames";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border border-white/[0.06] bg-[#111111] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] px-3 py-1 text-[14px] text-[#ededed] transition-all duration-200 ease-out file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[#555555] focus-visible:outline-none focus-visible:border-white/20 focus-visible:ring-1 focus-visible:ring-white/10 disabled:cursor-not-allowed disabled:opacity-50",
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
