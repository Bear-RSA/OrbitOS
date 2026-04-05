import * as React from "react";
import { cn } from "@/lib/utils/classnames";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[100px] w-full rounded-xl border border-white/[0.06] bg-[#111111] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] px-4 py-3 text-[14px] text-[#ededed] placeholder:text-[#555555] focus-visible:outline-none focus-visible:border-white/[0.1] focus-visible:ring-1 focus-visible:ring-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50 resize-none transition-colors",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
