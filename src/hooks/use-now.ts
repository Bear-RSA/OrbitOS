"use client";

import { useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/*  A ticking clock                                                    */
/*                                                                     */
/*  Presence expires on its own — a heartbeat goes stale whether or    */
/*  not anything re-renders. Without a tick, a colleague who closed    */
/*  their laptop stays green on your screen until some unrelated write */
/*  happens to wake the member listener.                               */
/*                                                                     */
/*  30 seconds, matching the timer the Personnel Network has always    */
/*  used, so the two surfaces go stale together.                       */
/* ------------------------------------------------------------------ */

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
