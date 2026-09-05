"use server";

import { adminDb } from "@/lib/firebase/admin";
import { logActivity } from "@/lib/telemetry";
import { FieldValue } from "firebase-admin/firestore";
import { requireCaller } from "@/lib/auth/caller";
import { verifyProjectAccess } from "@/lib/auth/permissions";

const MAX_SYSTEM_LOAD = 5;

/* ------------------------------------------------------------------ */
/*  Personnel engine                                                   */
/*                                                                     */
/*  Both actions took the workspace to operate on as an argument. An   */
/*  orgId is not a credential — it is on every member document and in  */
/*  every log entry — so passing someone else's read back their whole  */
/*  roster, or wrote a status transition into their workspace.         */
/*                                                                     */
/*  The workspace is now the caller's own, resolved from the session.  */
/*  The `orgId` parameters remain so existing call sites keep          */
/*  compiling, and are ignored.                                        */
/* ------------------------------------------------------------------ */

/**
 * Monitors a member's active workload and auto-transitions status.
 * Triggered whenever a directive status changes.
 *
 * `userId` is a colleague rather than the caller — assigning work to
 * someone re-evaluates their load, not yours — so it stays a parameter.
 * It is confined to the caller's own workspace below.
 *
 * @param _orgId @deprecated Ignored — resolved from the caller's session.
 */
export async function syncOperationalStatusAction(userId: string | null, _orgId?: string) {
  if (!userId) return; // Silent return for unassigned tasks
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const userRef = adminDb.collection("users").doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return { success: false, error: "User not found" };

    const userData = userSnap.data()!;

    // The target has to be a colleague. Without this the action would
    // write a status transition onto any user document in the system.
    if (userData.orgId !== caller.orgId) {
      return { success: false, error: "Unauthorized." };
    }

    // Rule: Respect manual status overrides
    if (userData.manualOverride === true) {
      console.log(`[Status Engine] Manual override active for ${userData.name}. Skipping auto-sync.`);
      return { success: true, status: userData.operationalStatus || "available" };
    }

    // 1. Calculate current active workload (Strict Scoping)
    // Note: Firestore disallows array-contains + inequality compound queries,
    // so we fetch all non-done tasks for the org and filter in-memory.
    const tasksSnap = await adminDb
      .collection("tasks")
      .where("orgId", "==", caller.orgId)
      .where("status", "!=", "done")
      .get();
    
    const activeCount = tasksSnap.docs.filter(doc =>
      doc.data().assignedTo.includes(userId)
    ).length;
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
        orgId: caller.orgId,
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

/**
 * Per-operative workload across one project.
 *
 * @param _orgId @deprecated Ignored — resolved from the caller's session.
 */
export async function getWorkloadTelemetryAction(projectId: string, _orgId?: string) {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const access = await verifyProjectAccess(caller.uid, projectId);
    if (!access.hasAccess) {
      return { success: false, error: "Unauthorized access to project." };
    }

    // 1. Fetch Node Network (Users in Org)
    const membersSnap = await adminDb
      .collection("users")
      .where("orgId", "==", caller.orgId)
      .get();

    if (membersSnap.empty) return { success: true, data: [] };

    const membersMap = new Map<string, any>();
    membersSnap.forEach(doc => {
      membersMap.set(doc.id, { id: doc.id, ...doc.data() });
    });

    // 2. Fetch Active Directives for this Project (Hardened Scoping)
    const tasksSnap = await adminDb
      .collection("tasks")
      .where("orgId", "==", caller.orgId)
      .where("projectId", "==", projectId)
      .where("status", "!=", "done")
      .get();

    const workloadMap = new Map<string, number>();
    tasksSnap.forEach(doc => {
      const assignees: string[] = doc.data().assignedTo;

      for (const uid of assignees) {
        if (membersMap.has(uid)) {
          workloadMap.set(uid, (workloadMap.get(uid) || 0) + 1);
        }
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
