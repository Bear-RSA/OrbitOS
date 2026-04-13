"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/classnames";
import { Loader } from "@/components/ui/loader";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13px] font-medium transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: 
          "bg-primary text-primary-foreground shadow-[0_2px_12px_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.3)] hover:brightness(1.04) active:scale-[0.97]",
        destructive: 
          "bg-destructive/10 text-destructive hover:bg-destructive/20 active:scale-[0.97]",
        outline: 
          "border border-outline-variant bg-transparent text-on-surface hover:bg-surface-low hover:border-outline-variant/60 active:scale-[0.97]",
        secondary: 
          "bg-gradient-to-b from-[#222222] to-[#151515] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.4)] hover:from-[#2a2a2a] hover:to-[#1a1a1a] active:scale-[0.97]",
        ghost: 
          "text-on-surface-variant hover:text-on-surface hover:bg-surface-low active:scale-[0.985]",
        link: 
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-6 py-2",
        sm: "h-8 rounded-sm px-3 text-[12px]",
        lg: "h-12 rounded-lg px-8 text-[14px]",
        icon: "h-10 w-10",
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
