"use client";

import { useEffect, useState } from "react";

/**
 * Tracks a media query. Reads it synchronously on the client so a surface
 * that mounts in response to a tap is right on its first frame — a dialog
 * that rendered centred for one frame and then became a sheet would flash.
 * On the server it is `false`. Layout should still be handled in CSS; this
 * is for behaviour that has to branch in JavaScript, like which gesture a
 * surface accepts.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [query]);

  return matches;
}
