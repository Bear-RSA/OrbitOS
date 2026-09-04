"use client";

import { useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Does this operator want motion suppressed?                         */
/*                                                                     */
/*  Two independent signals, same answer:                              */
/*    - the OS-level `prefers-reduced-motion` media query              */
/*    - the in-app preference (Settings -> General), which             */
/*      `PreferenceEffects` stamps onto <html> as data-reduced-motion  */
/*                                                                     */
/*  `globals.css` already collapses animation and transition durations */
/*  for both. This hook is for the cases CSS cannot reach: motion      */
/*  driven from JavaScript, which has to be switched off at the source */
/*  rather than sped up. Killing the transition on a JS-driven         */
/*  transform without killing the transform leaves the element         */
/*  snapping between positions, which is worse than the animation.     */
/* ------------------------------------------------------------------ */

const QUERY = "(prefers-reduced-motion: reduce)";
const ATTRIBUTE = "data-reduced-motion";

function readCurrent(): boolean {
  return (
    window.matchMedia(QUERY).matches ||
    document.documentElement.getAttribute(ATTRIBUTE) === "true"
  );
}

export function useReducedMotion(): boolean {
  // Starts false so the server render and the first client render agree.
  // The effect below corrects it before paint-relevant work happens.
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const sync = () => setReduced(readCurrent());
    sync();

    const media = window.matchMedia(QUERY);
    media.addEventListener("change", sync);

    // The preference lands on <html> asynchronously, once the Firestore
    // profile resolves, so a one-shot read on mount would miss it.
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [ATTRIBUTE],
    });

    return () => {
      media.removeEventListener("change", sync);
      observer.disconnect();
    };
  }, []);

  return reduced;
}
