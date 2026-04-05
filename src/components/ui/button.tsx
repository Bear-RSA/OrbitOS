"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/classnames";
import { Loader } from "@/components/ui/loader";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13px] font-medium transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 ring-offset-[#0A0A0A]",
  {
    variants: {
      variant: {
        default: "bg-[#ededed] text-[#0A0A0A] shadow-lg hover:bg-[#ffffff] active:scale-[0.98]",
        destructive: "bg-[#E57A7A]/10 text-[#E57A7A] hover:bg-[#E57A7A]/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] active:scale-[0.98]",
        outline: "border border-white/[0.06] bg-transparent text-[#ededed] hover:bg-white/[0.02] active:scale-[0.98]",
        secondary: "bg-[#111111] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.2)] hover:bg-[#1a1a1a] active:scale-[0.98]",
        ghost: "text-[#888888] hover:text-[#ededed] hover:bg-white/[0.02] active:scale-[0.98]",
        link: "text-[#ededed] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-[12px]",
        lg: "h-11 rounded-xl px-8 text-[14px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    
    // Determine loader color based on variant
    const loaderColor = variant === 'default' ? '#0A0A0A' : 
                        variant === 'destructive' ? '#E57A7A' : 
                        '#ededed';

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isLoading || disabled}
        {...props}
      >
        {isLoading && (
          <Loader size={16} stroke={2} color={loaderColor} className="mr-1" />
        )}
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
