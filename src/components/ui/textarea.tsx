import * as React from "react";
import { cn } from "@/lib/utils/classnames";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[100px] w-full rounded-lg bg-surface-lowest border-0 px-6 py-4 text-[14px] text-on-surface transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] placeholder:text-on-surface-variant/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/20 focus-visible:bg-surface-low disabled:cursor-not-allowed disabled:opacity-50 resize-none",
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
