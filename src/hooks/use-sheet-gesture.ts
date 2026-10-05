"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { AnimatedValue, VelocityTracker } from "@/lib/motion/animated-value";
import { SPRING, rubberband } from "@/lib/motion/spring";
import { decideRelease } from "@/lib/motion/sheet";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

/* ------------------------------------------------------------------ */
/*  Bottom-sheet gesture                                               */
/*                                                                     */
/*  The sheet is glued to the finger the whole way — it tracks 1:1,    */
/*  respects where it was grabbed, rubber-bands past the top, and on   */
/*  release continues at the finger's exact speed. Where it lands is   */
/*  decided by where the throw was *going*, not where it let go, so a  */
/*  short fast flick dismisses and a long slow drag that stops halfway */
/*  springs back. A closing sheet can be caught and pulled back up.    */
/*                                                                     */
/*  Vertical offset is in px, 0 = open, height = off-screen.           */
/* ------------------------------------------------------------------ */

/** Movement before the gesture commits to a drag; taps pass through. */
const HYSTERESIS_PX = 8;

interface Options {
  enabled: boolean;
  sheetRef: RefObject<HTMLElement | null>;
  overlayRef: RefObject<HTMLElement | null>;
  /** The gesture decided the sheet should go. Unmount it. */
  onDismiss: () => void;
}

// `useLayoutEffect` warns on the server; the sheet is client-only anyway.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Nearest element, up to and including the sheet, that can scroll. */
function scrollableAncestor(target: EventTarget | null, within: HTMLElement): HTMLElement | null {
  let node = target instanceof HTMLElement ? target : null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    if (node === within) break;
    node = node.parentElement;
  }
  return null;
}

export function useSheetGesture({ enabled, sheetRef, overlayRef, onDismiss }: Options): void {
  const reducedMotion = useReducedMotion();
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useIsomorphicLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!enabled || !sheet) return;

    const y = new AnimatedValue(0);
    const tracker = new VelocityTracker();
    const height = () => sheet.offsetHeight;

    // Paint the value straight to the DOM. The scrim dims with the sheet
    // so backing off the gesture backs off the focus too.
    const unsubscribe = y.subscribe((value) => {
      sheet.style.transform = `translate3d(0, ${value}px, 0)`;
      const overlay = overlayRef.current;
      if (overlay) {
        const progress = Math.min(Math.max(value / height(), 0), 1);
        overlay.style.opacity = String(1 - progress);
      }
    });

    // Arrival. From rest, so no overshoot — bounce is for things the user
    // threw. Reduced motion skips straight to open; the CSS fade covers it.
    if (reducedMotion) {
      y.set(0);
    } else {
      y.set(height());
      y.animateTo(0, { config: SPRING.default });
    }

    let pointerId: number | null = null;
    let startClientY = 0;
    let grabOffset = 0;
    let dragging = false;
    let abandoned = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || pointerId !== null) return;
      pointerId = e.pointerId;
      startClientY = e.clientY;
      // Respect the grab: the sheet keeps its offset from the finger
      // rather than snapping to it. Grabbing mid-flight also stops the
      // spring — the thought and the gesture happen in parallel.
      grabOffset = y.get();
      y.stop();
      dragging = false;
      abandoned = false;
      tracker.reset();
      tracker.push(e.clientY, e.timeStamp);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId || abandoned) return;
      const dy = e.clientY - startClientY;
      tracker.push(e.clientY, e.timeStamp);

      if (!dragging) {
        if (Math.abs(dy) < HYSTERESIS_PX) return;
        // Content that can scroll keeps its scroll; the sheet only takes
        // over when the scroller is already at the top and the finger is
        // pulling down, or when the sheet was already displaced.
        const scroller = scrollableAncestor(e.target, sheet);
        if (scroller && grabOffset === 0 && (dy < 0 || scroller.scrollTop > 0)) {
          abandoned = true;
          return;
        }
        dragging = true;
        sheet.setPointerCapture(pointerId);
        // Re-anchor so the first tracked frame does not jump by the
        // hysteresis distance.
        startClientY = e.clientY;
        return;
      }

      const raw = grabOffset + (e.clientY - startClientY);
      // Above the resting position there is nothing more to see; resist
      // rather than stop.
      const next = raw < 0 ? rubberband(raw, height()) : raw;
      y.set(next);
    };

    const release = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const wasDragging = dragging;
      pointerId = null;
      dragging = false;
      if (!wasDragging) return;
      if (sheet.hasPointerCapture(e.pointerId)) sheet.releasePointerCapture(e.pointerId);

      const velocity = tracker.velocity(e.timeStamp);
      const h = height();

      if (decideRelease(y.get(), velocity, h) === "dismiss") {
        y.animateTo(h, {
          config: SPRING.default,
          velocity,
          onRest: () => dismissRef.current(),
        });
      } else {
        // The gesture carried momentum, so a touch of overshoot is right.
        y.animateTo(0, { config: SPRING.momentum, velocity });
      }
    };

    sheet.addEventListener("pointerdown", onPointerDown);
    sheet.addEventListener("pointermove", onPointerMove);
    sheet.addEventListener("pointerup", release);
    sheet.addEventListener("pointercancel", release);

    return () => {
      sheet.removeEventListener("pointerdown", onPointerDown);
      sheet.removeEventListener("pointermove", onPointerMove);
      sheet.removeEventListener("pointerup", release);
      sheet.removeEventListener("pointercancel", release);
      unsubscribe();
      y.destroy();
    };
  }, [enabled, sheetRef, overlayRef, reducedMotion]);
}
