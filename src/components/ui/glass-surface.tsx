"use client";

import * as React from "react";
import { cn } from "@/lib/utils/classnames";
import { useLiquidGlass } from "@/hooks/use-liquid-glass";

/* ------------------------------------------------------------------ */
/*  Glass surface                                                      */
/*                                                                     */
/*  Any translucent panel in the app. Where the browser can render it */
/*  (see hooks/use-liquid-glass) the panel is liquid glass; everywhere */
/*  else it wears `fallback`, the CSS material it always had.          */
/*                                                                     */
/*  Background and backdrop-filter classes belong in `fallback`, never */
/*  in `className`: a panel that keeps its own backdrop-filter walls   */
/*  the lens off from the page, and an opaque fill hides the bend.     */
/*                                                                     */
/*  Children always sit in `.ql-content`, glass or not, so the switch  */
/*  never remounts them. That wrapper hands on the panel's flex or     */
/*  grid layout (see `.liquid-host` in globals.css), but rules that    */
/*  reach direct children — `space-y-*`, `divide-y` — have to move to  */
/*  `contentClassName`.                                                */
/* ------------------------------------------------------------------ */

/** Over the orbit backdrop: light frost, the planet reads through. */
const PANEL = { tintOpacity: 0.2, blur: 6 };
/** Over the page's own content: thick enough that text behind is gone. */
const OVERLAY = { tintOpacity: 0.55, blur: 22 };
/** A bar content scrolls under: the old chrome's frost, a lighter wash. */
const CHROME = { tintOpacity: 0.5, blur: 20 };
const WEIGHTS = { panel: PANEL, overlay: OVERLAY, chrome: CHROME };

export interface GlassSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Classes worn when the lens is unavailable, e.g. "material-fog". */
  fallback: string;
  /**
   * "overlay" for anything that floats over the page rather than the
   * backdrop; "chrome" for a bar the page scrolls under.
   */
  weight?: keyof typeof WEIGHTS;
  /** Theme token the glass is tinted with. */
  tint?: string;
  /**
   * Absolutely positioned pieces placed against the panel itself rather
   * than its content box. Give them a z-index to sit above the glass.
   */
  decoration?: React.ReactNode;
  contentClassName?: string;
  /** Keep `fallback` even where glass is supported. */
  disabled?: boolean;
}

export const GlassSurface = React.forwardRef<HTMLDivElement, GlassSurfaceProps>(
  ({ fallback, weight = "panel", tint = "surface-card", decoration, contentClassName, disabled, className, children, ...props }, forwardedRef) => {
    const ref = React.useRef<HTMLDivElement | null>(null);
    const setRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        ref.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef]
    );
    const glass = useLiquidGlass(ref, { tint, disabled, ...WEIGHTS[weight] });

    return (
      <div ref={setRef} {...props} className={cn("liquid-host", className, glass ? "liquid-glass" : fallback)}>
        {decoration}
        <div className={cn("ql-content", contentClassName)}>{children}</div>
      </div>
    );
  }
);
GlassSurface.displayName = "GlassSurface";
