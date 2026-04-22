"use client";

import { useEffect } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

/**
 * Hook to maintain real-time presence in the OrbitOS Personnel Network.
 * Updates the user's lastActivity heartbeat every 3 minutes.
 */
export function useHeartbeat(uid: string | undefined) {
  useEffect(() => {
    if (!uid) return;

    const updateHeartbeat = async () => {
      try {
        const userRef = doc(db, "users", uid);
        await updateDoc(userRef, {
          lastActivity: serverTimestamp(),
          operationalStatus: "available" // Reset to available when active
        });
        console.log(`[Telemetry] Heartbeat pulse transmitted for Node: ${uid}`);
      } catch (err) {
        console.warn("[Telemetry] Heartbeat signal lost:", err);
      }
    };

    // Initial pulse
    updateHeartbeat();

    // Pulse every 3 minutes
    const interval = setInterval(updateHeartbeat, 3 * 60 * 1000);

    return () => clearInterval(interval);
  }, [uid]);
}
