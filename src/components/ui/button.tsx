"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/classnames";
import { Loader } from "@/components/ui/loader";
import { themeColor } from "@/lib/theme/colors";

/* ------------------------------------------------------------------ */
/*  Button                                                             */
/*                                                                     */
/*  Feedback lives on the press. The scale-down is on `:active`, which */
/*  fires on pointer-down, and it takes 90ms — anything slower and the */
/*  button reads as dead until the click resolves. The release springs */
/*  back on the house curve. Colour and shadow ride a separate, slower */
/*  transition so a hover never delays the press.                      */
/* ------------------------------------------------------------------ */

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13px] font-medium",
    "transition-[transform,background-color,border-color,color,box-shadow,filter] duration-quick ease-spring",
    "will-change-transform",
    "active:scale-[0.97] active:duration-press active:ease-press",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base",
    "disabled:pointer-events-none disabled:opacity-50",
    // Touch: kill the grey tap flash so the scale is the only feedback.
    "[-webkit-tap-highlight-color:transparent]",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(var(--scrim)_/_0.2),0_8px_24px_rgb(var(--scrim)_/_0.18)] hover:brightness-[1.04] active:brightness-[0.98]",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
        outline:
          "border border-outline-variant bg-transparent text-on-surface hover:bg-surface-low hover:border-outline-variant/60",
        secondary:
          "bg-gradient-to-b from-surface-active to-surface-control text-ink shadow-[inset_0_1px_0_rgb(var(--sheen)_/_calc(0.08*var(--sheen-a))),0_1px_2px_rgb(var(--scrim)_/_0.3)] hover:from-surface-active hover:to-surface-hover",
        ghost: "text-on-surface-variant hover:text-on-surface hover:bg-surface-low active:scale-[0.985]",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
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
    const loaderColor =
      variant === "default" ? themeColor.onInk : variant === "destructive" ? themeColor.red : themeColor.ink;

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isLoading || disabled}
        {...props}
      >
        {isLoading && <Loader size={16} stroke={2} color={loaderColor} className="mr-1" />}
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
