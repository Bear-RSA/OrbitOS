"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/classnames";
import { Loader } from "@/components/ui/loader";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[13px] font-medium transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.985]",
  {
    variants: {
      variant: {
        default: 
          "bg-primary text-primary-foreground shadow-sm hover:brightness(1.04) active:scale-[0.985]",
        destructive: 
          "bg-destructive/10 text-destructive hover:bg-destructive/20 active:scale-[0.985]",
        outline: 
          "border border-outline-variant bg-transparent text-on-surface hover:bg-surface-low hover:border-outline-variant/60 active:scale-[0.985]",
        secondary: 
          "bg-surface-container text-on-surface hover:bg-surface-highest/60 active:scale-[0.985]",
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
