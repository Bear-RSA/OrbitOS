"use client";

import * as React from "react";
import { cn } from "@/lib/utils/classnames";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { AnimatedValue } from "@/lib/motion/animated-value";
import { SPRING } from "@/lib/motion/spring";

/* ------------------------------------------------------------------ */
/*  Interactive card                                                   */
/*                                                                     */
/*  Leans a few pixels toward the cursor. That lean is a *tracked*     */
/*  value — the pointer owns it — so it is written on the frame it is  */
/*  measured, never pushed through a transition. The old version ran   */
/*  it through a 500ms ease with a 50ms intent delay, which made the   */
/*  card trail the cursor and read as laggy rather than magnetic.      */
/*  When the cursor leaves, the card springs home from wherever it is, */
/*  at whatever speed the cursor left it — two independent springs so  */
/*  x and y do not desync.                                             */
/* ------------------------------------------------------------------ */

type InteractiveCardProps = {
  children: React.ReactNode;
  className?: string;
  /**
   * "fog" is the calendar's translucent panel (`material-fog`), for cards
   * that sit on the orbit backdrop inside the app. Marketing keeps "solid".
   */
  surface?: "solid" | "fog";
};

/** How far the card follows: 1/20 of the offset, scaled down again. */
const FOLLOW = 0.15 / 20;

export function InteractiveCard({ children, className, surface = "solid" }: InteractiveCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  React.useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    // Never attach the listeners at all when motion is suppressed; a card
    // that jumps to the cursor is worse than one that stays put.
    if (reducedMotion) {
      card.style.transform = "";
      card.style.removeProperty("--card-mouse-x");
      card.style.removeProperty("--card-mouse-y");
      return;
    }

    const x = new AnimatedValue(0);
    const y = new AnimatedValue(0);
    let frame: number | null = null;

    const paint = () => {
      frame = null;
      card.style.transform = `translate3d(${x.get().toFixed(2)}px, ${y.get().toFixed(2)}px, 0)`;
    };
    // Both springs write on the same frame; coalesce so a 2D move is one paint.
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(paint);
    };
    const offX = x.subscribe(schedule);
    const offY = y.subscribe(schedule);

    // Two samples are enough to know how fast the cursor was going.
    let prev = { x: 0, y: 0, t: 0 };
    let last = { x: 0, y: 0, t: 0 };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;

      const rect = card.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const tx = (px - rect.width / 2) * FOLLOW;
      const ty = (py - rect.height / 2) * FOLLOW;

      prev = last;
      last = { x: tx, y: ty, t: e.timeStamp };
      // Direct manipulation: the pointer sets the value, no easing.
      x.set(tx);
      y.set(ty);

      // Card-local cursor position for the glow. Deliberately NOT the
      // global `--mouse-x`/`--mouse-y`, which `InteractionProvider` owns
      // as a viewport percentage.
      card.style.setProperty("--card-mouse-x", `${px.toFixed(0)}px`);
      card.style.setProperty("--card-mouse-y", `${py.toFixed(0)}px`);
    };

    const handlePointerLeave = (e: PointerEvent) => {
      // Hand the cursor's exit speed to the spring so there is no seam
      // between following and settling.
      const dt = (last.t - prev.t) / 1000;
      const stale = e.timeStamp - last.t > 60;
      const vx = dt > 0 && !stale ? (last.x - prev.x) / dt : 0;
      const vy = dt > 0 && !stale ? (last.y - prev.y) / dt : 0;
      x.animateTo(0, { config: SPRING.default, velocity: vx });
      y.animateTo(0, { config: SPRING.default, velocity: vy });
    };

    card.addEventListener("pointermove", handlePointerMove, { passive: true });
    card.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      card.removeEventListener("pointermove", handlePointerMove);
      card.removeEventListener("pointerleave", handlePointerLeave);
      if (frame !== null) cancelAnimationFrame(frame);
      offX();
      offY();
      x.destroy();
      y.destroy();
    };
  }, [reducedMotion]);

  return (
    <div
      ref={cardRef}
      className={cn(
        "focus-item group relative overflow-hidden rounded-[32px]",
        // Colour and shadow ease; transform is owned by the springs above.
        "transition-[background-color,box-shadow] duration-settle ease-spring",
        // The lean is mouse-only, so only a fine pointer pays for a layer.
        "card-lean",
        "hover:shadow-[0_24px_80px_rgb(var(--scrim)_/_0.5)]",
        /* Fog lives in the same CSS layer as the bg utilities, so the two
           are never combined — whichever is emitted later would win. */
        surface === "fog"
          ? "material-fog border border-line/[0.06] ring-1 ring-line/5 shadow-raised hover:[--fog-alpha:0.55]"
          : "bg-surface-lowest hover:bg-surface-low",
        className
      )}
    >
      {/* Cursor-aware glow, centred until the first move and on touch. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-settle ease-spring group-hover:opacity-100"
        style={{
          background: `radial-gradient(600px circle at var(--card-mouse-x, 50%) var(--card-mouse-y, 50%), rgb(var(--sheen) / calc(0.03 * var(--sheen-a))), transparent 70%)`,
        }}
      />

      {/* Surface depth shimmer (tone, not glow) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-sheen/[0.01] to-transparent opacity-0 transition-opacity duration-settle ease-spring group-hover:opacity-100" />

      <div className="relative z-10">{children}</div>
    </div>
  );
}
