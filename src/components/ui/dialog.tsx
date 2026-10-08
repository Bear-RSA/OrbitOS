"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSheetGesture } from "@/hooks/use-sheet-gesture";

/* ------------------------------------------------------------------ */
/*  Dialog                                                             */
/*                                                                     */
/*  One primitive, two presentations.                                  */
/*                                                                     */
/*  Desktop: a centred glass panel that materialises — blur radius,    */
/*  scale and opacity animate together, so it reads as a material      */
/*  arriving rather than a picture fading in. It leaves the way it     */
/*  came. The scrim dims the page behind it to say "this is modal".    */
/*                                                                     */
/*  Phone: a sheet from the bottom edge. It is driven by a finger, not */
/*  a timer — it tracks 1:1, rubber-bands at the top, continues at the */
/*  finger's speed when released, and lands where the throw was going. */
/*  A closing sheet can be caught. See use-sheet-gesture.              */
/* ------------------------------------------------------------------ */

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const SHEET_QUERY = "(max-width: 639px)";

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-scrim/[var(--scrim-alpha)] backdrop-blur-sm",
      "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-quick",
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-quick",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /**
   * Present as a bottom sheet on phone-sized viewports. On by default;
   * a dialog that must stay centred everywhere can opt out.
   */
  sheet?: boolean;
}

const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, sheet = true, ...props }, forwardedRef) => {
    const contentRef = React.useRef<HTMLDivElement | null>(null);
    const overlayRef = React.useRef<HTMLDivElement | null>(null);
    const closeRef = React.useRef<HTMLButtonElement | null>(null);
    const isSheet = useMediaQuery(SHEET_QUERY) && sheet;
    const [dismissed, setDismissed] = React.useState(false);

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        contentRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef]
    );

    useSheetGesture({
      enabled: isSheet,
      sheetRef: contentRef,
      overlayRef,
      // The gesture has already carried the sheet off-screen. Radix owns
      // open state at the call site, so close through its own button;
      // `data-dismissed` makes the CSS exit a no-op so nothing replays.
      onDismiss: () => {
        setDismissed(true);
        closeRef.current?.click();
      },
    });

    return (
      <DialogPortal>
        <DialogOverlay ref={overlayRef} />
        <DialogPrimitive.Content
          ref={setRefs}
          data-sheet={isSheet ? "" : undefined}
          data-dismissed={dismissed ? "" : undefined}
          className={cn(
            "fixed z-50 grid w-full gap-6 p-8 sm:p-12 text-ink selection:bg-primary/20",
            "material-sheet shadow-overlay",
            "ring-1 ring-inset ring-line/[0.08]",
            "focus:outline-none",

            /* ── Centred panel (sm and up) ──
               Capped to the viewport and scrolling inside: a panel centred
               with translate grows off both edges when its content is
               taller than the window, taking the footer's buttons with it. */
            "sm:left-1/2 sm:top-1/2 sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[32px]",
            "sm:max-h-[calc(100dvh-3rem)] sm:overflow-y-auto sm:overscroll-contain",
            /* Slim house scrollbar, inset so it clears the rounded corners. */
            "custom-scrollbar [&::-webkit-scrollbar-track]:my-8",
            "sm:data-[state=open]:animate-in sm:data-[state=open]:fade-in-0 sm:data-[state=open]:zoom-in-95 sm:data-[state=open]:blur-in sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]",
            "sm:data-[state=closed]:animate-out sm:data-[state=closed]:fade-out-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=closed]:blur-out sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%]",

            /* ── Sheet (below sm) ──
               Position is driven by the gesture hook writing `transform`;
               the only CSS motion is the exit, which runs from wherever the
               sheet currently is. `pan-y` leaves scrolling inside to the
               browser; the hook takes over only at the top edge. */
            "max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[92dvh] max-sm:overflow-y-auto max-sm:overscroll-contain",
            "max-sm:rounded-t-[28px] max-sm:rounded-b-none max-sm:pt-12 max-sm:pb-[max(2rem,env(safe-area-inset-bottom))]",
            "max-sm:[touch-action:pan-y] max-sm:will-change-transform",
            className
          )}
          {...props}
        >
          {/* Grab handle. Only the sheet has one; it is the affordance that
              says "this can be pulled". */}
          {isSheet && (
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 flex h-9 items-start justify-center pt-3 [touch-action:none]"
            >
              <div className="h-[5px] w-10 rounded-full bg-ink/20" />
            </div>
          )}
          {children}
          <DialogClose
            ref={closeRef}
            className={cn(
              "absolute right-6 top-6 rounded-full p-2 text-on-surface opacity-40",
              "transition-[opacity,background-color,transform] duration-quick ease-spring",
              "hover:bg-surface-hover hover:opacity-100 active:scale-95 active:duration-press",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              "disabled:pointer-events-none",
              isSheet && "hidden"
            )}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  }
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mb-6 flex flex-col space-y-2 text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:gap-0 sm:space-x-3", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-title text-on-surface", className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-body font-light text-on-surface-variant", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
