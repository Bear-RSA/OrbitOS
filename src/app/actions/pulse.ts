"use server";

import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export async function getProjectPulseAction(projectId: string) {
  try {
    const now = Date.now();
    const fiveMinsAgo = new Date(now - 5 * 60 * 1000);
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    // 1. Health Score
    const tasksSnap = await adminDb
      .collection("tasks")
      .where("projectId", "==", projectId)
      .get();
    
    let totalTasks = 0;
    let executedTasks = 0;
    tasksSnap.forEach((doc) => {
      totalTasks++;
      if (doc.data().status === "done") {
        executedTasks++;
      }
    });

    const healthScore = totalTasks === 0 ? 0 : Math.round((executedTasks / totalTasks) * 100);

    // Earliest milestone horizon
    let earliestDue: Date | null = null;
    tasksSnap.forEach((doc) => {
      const data = doc.data();
      if (data.status !== "done" && data.dueDate) {
        const d = data.dueDate.toDate();
        if (!earliestDue || d < earliestDue) {
          earliestDue = d;
        }
      }
    });

    // 2. Active Users (last 5 mins) & Hotspots (last 24 hours)
    // Removed timestamp filter from query to prevent index requirement
    const activitySnap = await adminDb
      .collection("activity")
      .where("projectId", "==", projectId)
      .get();

    const activeMap = new Map<string, { uid: string; name: string }>();
    const milestoneCounts: Record<string, number> = {};

    activitySnap.forEach((doc) => {
      const data = doc.data();
      if (!data.timestamp) return;
      
      const tsMs = typeof data.timestamp.toDate === 'function' 
        ? data.timestamp.toDate().getTime() 
        : new Date(data.timestamp).getTime();

      // Filter for last 24h in memory
      if (tsMs < oneDayAgo.getTime()) return;

      // Check active users in last 5 min
      if (tsMs >= fiveMinsAgo.getTime()) {
        if (data.actor?.uid && !activeMap.has(data.actor.uid)) {
          activeMap.set(data.actor.uid, { uid: data.actor.uid, name: data.actor.name });
        }
      }

      // Check hotspots mapping in last 24h
      const mil = data.payload?.milestone;
      if (mil) {
        milestoneCounts[mil] = (milestoneCounts[mil] || 0) + 1;
      }
    });

    const activeUsers = Array.from(activeMap.values());
    const activityHotspots = Object.entries(milestoneCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    // 3. Storage Velocity
    const filesSnap = await adminDb
      .collection("projects")
      .doc(projectId)
      .collection("files")
      .get();

    let totalStorageBytes = 0;
    let recentStorageBytes = 0;

    filesSnap.forEach((doc) => {
      const data = doc.data();
      const size = Number(data.size) || 0;
      totalStorageBytes += size;
      if (data.createdAt) {
        const createdMs = typeof data.createdAt.toDate === 'function' 
          ? data.createdAt.toDate().getTime() 
          : new Date(data.createdAt).getTime();
          
        if (createdMs >= oneDayAgo.getTime()) {
          recentStorageBytes += size;
        }
      }
    });

    let storageVelocity = "+0%";
    if (totalStorageBytes > 0) {
      if (recentStorageBytes === 0) {
        storageVelocity = "STABLE";
      } else {
        const oldStorage = totalStorageBytes - recentStorageBytes;
        if (oldStorage === 0) {
          storageVelocity = "+100%";
        } else {
          const growth = (recentStorageBytes / oldStorage) * 100;
          storageVelocity = `+${Math.round(growth)}%`;
        }
      }
    }

    return {
      success: true,
      data: {
        healthScore,
        activeUsers,
        activityHotspots,
        storageVelocity,
        earliestDue: earliestDue ? (earliestDue as Date).toISOString() : null
      }
    };

  } catch (error) {
    console.error("Failed to compile project pulse:", error);
    return { success: false, error: "System failure compiling pulse." };
  }
}
