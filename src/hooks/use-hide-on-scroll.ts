"use client";

import { useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Hide on scroll down, return on scroll up                           */
/*                                                                     */
/*  The two directions are deliberately lopsided. Hiding waits for a   */
/*  real, intentional scroll down past the top of the page, so a       */
/*  trackpad twitch or a reading nudge does not send the bar away.     */
/*  Showing takes any upward movement at all: reaching for the nav is  */
/*  the one moment it has to be there already.                         */
/*                                                                     */
/*  Reads the window once per frame at most, and only sets state when  */
/*  the answer changes, so a long scroll re-renders nothing.           */
/* ------------------------------------------------------------------ */

/** Never hide while this close to the top — the bar sits on the page there. */
const TOP_ZONE = 96;
/** Downward travel, in px, before the bar commits to leaving. */
const HIDE_AFTER = 10;
/** Upward travel that brings it back. Small, but above sub-pixel jitter. */
const SHOW_AFTER = 2;

export function useHideOnScroll(enabled: boolean): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }

    let last = window.scrollY;
    // Distance travelled in the current direction; resets on reversal.
    let travel = 0;
    let frame = 0;

    const read = () => {
      frame = 0;
      // Clamp out iOS rubber-banding: bouncing back off the bottom edge
      // reads as an upward scroll and would summon the bar for nothing.
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = Math.min(Math.max(window.scrollY, 0), Math.max(max, 0));
      const delta = y - last;
      last = y;
      if (delta === 0) return;

      if (y < TOP_ZONE) {
        travel = 0;
        setHidden(false);
        return;
      }

      travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;
      if (travel > HIDE_AFTER) setHidden(true);
      else if (travel < -SHOW_AFTER) setHidden(false);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled]);

  return hidden;
}
