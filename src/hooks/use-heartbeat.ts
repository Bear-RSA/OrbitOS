"use client";

import { useEffect } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

/* ------------------------------------------------------------------ */
/*  Heartbeat                                                          */
/*                                                                     */
/*  The one signal presence trusts. It used to be mounted on the       */
/*  project page alone, so anyone on the dashboard, in Messages or on  */
/*  Teams showed offline to everybody while plainly at their desk.     */
/*  It is mounted once for the session now (`PresenceHeartbeat`).      */
/*                                                                     */
/*  It pulses only while the tab is in view. A tab left open in the    */
/*  background overnight is not somebody being here, and a pulse that  */
/*  ignored visibility kept them green until the browser closed.       */
/*  Coming back to the tab pulses at once, so the dot does not wait    */
/*  for the next interval to notice.                                   */
/*                                                                     */
/*  It writes `lastActivity` and nothing else. It used to reset        */
/*  `operationalStatus` to "available" too, which quietly undid a      */
/*  "focused" or "offline" someone had chosen in Settings.             */
/* ------------------------------------------------------------------ */

/** Must stay under `PRESENCE_STALE_AFTER_MS` so one missed pulse is not offline. */
const PULSE_MS = 2 * 60_000;

export function useHeartbeat(uid: string | undefined) {
  useEffect(() => {
    if (!uid) return;

    let lastPulse = 0;

    const pulse = async () => {
      if (document.visibilityState !== "visible") return;
      lastPulse = Date.now();
      try {
        await updateDoc(doc(db, "users", uid), { lastActivity: serverTimestamp() });
      } catch (err) {
        console.warn("[Presence] Heartbeat write failed:", err);
      }
    };

    // Back in view: pulse now, unless one landed in the last half minute.
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastPulse > 30_000) {
        void pulse();
      }
    };

    void pulse();
    const interval = setInterval(pulse, PULSE_MS);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [uid]);
}
