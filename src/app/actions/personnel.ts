"use server";

import { adminDb } from "@/lib/firebase/admin";
import { logActivity } from "@/lib/telemetry";
import { FieldValue } from "firebase-admin/firestore";

const MAX_SYSTEM_LOAD = 5;

/**
 * Monitors a member's active workload and auto-transitions status.
 * Triggered whenever a directive status changes.
 */
export async function syncOperationalStatusAction(userId: string | null, orgId: string) {
  if (!userId) return; // Silent return for unassigned tasks
  try {
    const userRef = adminDb.collection("users").doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return { success: false, error: "User not found" };
    
    const userData = userSnap.data()!;
    
    // Rule: Respect manual status overrides
    if (userData.manualOverride === true) {
      console.log(`[Status Engine] Manual override active for ${userData.name}. Skipping auto-sync.`);
      return { success: true, status: userData.operationalStatus || "available" };
    }

    // 1. Calculate current active workload (Strict Scoping)
    const tasksSnap = await adminDb
      .collection("tasks")
      .where("orgId", "==", orgId)
      .where("assignedTo", "==", userId)
      .where("status", "!=", "done")
      .get();
    
    const activeCount = tasksSnap.size;
    const loadPercentage = (activeCount / MAX_SYSTEM_LOAD) * 100;

    // 2. Resolve current status
    const currentStatus = userData.operationalStatus || "available";
    let newStatus = currentStatus;

    // Automated Logic: > 80% load signals FOCUSED state
    if (loadPercentage >= 80 && currentStatus !== "focused") {
      newStatus = "focused";
    } else if (loadPercentage < 80 && currentStatus === "focused") {
      newStatus = "available";
    }

    // Heartbeat check: If last activity is > 5 mins, transition to OFFLINE
    if (userData.lastActivity) {
      const last = userData.lastActivity.toDate().getTime();
      const fiveMinsAgo = Date.now() - 5 * 60 * 1000;
      if (last < fiveMinsAgo) {
        newStatus = "offline";
      }
    }

    // 3. Persist and Log if transition occurred
    if (newStatus !== currentStatus) {
      await userRef.update({
        operationalStatus: newStatus,
        lastActivity: FieldValue.serverTimestamp()
      });

      await logActivity({
        eventType: "STATUS_TRANSITION",
        orgId,
        actor: { uid: userId, name: userData.name || "System" },
        metadata: { from: currentStatus, to: newStatus, load: `${Math.round(loadPercentage)}%` }
      });
      
      console.log(`[Status Engine] ${userData.name} transitioned: ${currentStatus} -> ${newStatus}`);
    }

    return { success: true, status: newStatus };
  } catch (error) {
    console.error("[Status Engine] Sync failed:", error);
    return { success: false, error: "Operational status sync failed" };
  }
}

export async function getWorkloadTelemetryAction(projectId: string, orgId: string) {
  try {
    // 1. Fetch Node Network (Users in Org)
    const membersSnap = await adminDb
      .collection("users")
      .where("orgId", "==", orgId)
      .get();
    
    if (membersSnap.empty) return { success: true, data: [] };

    const membersMap = new Map<string, any>();
    membersSnap.forEach(doc => {
      membersMap.set(doc.id, { id: doc.id, ...doc.data() });
    });

    // 2. Fetch Active Directives for this Project (Hardened Scoping)
    const tasksSnap = await adminDb
      .collection("tasks")
      .where("orgId", "==", orgId)
      .where("projectId", "==", projectId)
      .where("status", "!=", "done")
      .get();

    const workloadMap = new Map<string, number>();
    tasksSnap.forEach(doc => {
      const { assignedTo } = doc.data();
      if (assignedTo && membersMap.has(assignedTo)) {
        workloadMap.set(assignedTo, (workloadMap.get(assignedTo) || 0) + 1);
      }
    });

    // 3. Assemble Telemetry
    const telemetry = Array.from(membersMap.values()).map(member => {
      const activeCount = workloadMap.get(member.id) || 0;
      return {
        id: member.id,
        name: member.name || "Operator",
        role: member.role || "MEMBER",
        photoURL: member.photoURL || null,
        activeTasks: activeCount,
        loadIndicator: activeCount >= MAX_SYSTEM_LOAD ? 100 : (activeCount / MAX_SYSTEM_LOAD) * 100,
        lastActivity: member.lastActivity?.toDate?.().toISOString() || null
      };
    });

    return { success: true, data: telemetry };
  } catch (error) {
    console.error("[Personnel Engine] Telemetry fetch failed:", error);
    return { success: false, error: "System failure during workload calculation" };
  }
}
