"use server";

import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { validateOwner } from "@/lib/auth/permissions";
import { requireServerUid } from "@/lib/auth/session";
import { logActivity } from "@/lib/telemetry";

/* ------------------------------------------------------------------ */
/*  Remove Member — server action                                      */
/*  Atomically removes a user from the org and unassigns their tasks   */
/*  within the specified project. Owner-only operation.                */
/*                                                                     */
/*  The caller used to name themselves in the payload, and the OWNER   */
/*  check below ran against that name. Owner uids are not secret —     */
/*  they sit in member lists and activity logs — so any signed-in user */
/*  could borrow one and evict people from that workspace. The uid now */
/*  comes from the session; `uid` stays in the payload so existing     */
/*  call sites keep compiling, and is ignored.                         */
/* ------------------------------------------------------------------ */

interface RemoveMemberPayload {
  projectId?: string;
  targetUserId: string;
  /** @deprecated Ignored — the caller's identity comes from the session. */
  uid?: string;
}

interface RemoveMemberResult {
  success: boolean;
  error?: string;
}

export async function removeMemberAction(
  payload: RemoveMemberPayload
): Promise<RemoveMemberResult> {
  const { projectId, targetUserId } = payload;

  try {
    let uid: string;
    try {
      uid = await requireServerUid();
    } catch {
      return { success: false, error: "Your session has expired. Sign in again." };
    }

    // 1. Validate caller is OWNER and scope is valid
    const authStatus = await validateOwner(uid, targetUserId, projectId);
    if (!authStatus.isOwner) {
      return { success: false, error: authStatus.error ?? "Unauthorized. Requires OWNER clearance." };
    }
    const callerOrgId = authStatus.orgId!;

    // 2. Prevent owner from removing themselves
    if (targetUserId === uid) {
      return { success: false, error: "Cannot remove yourself. Transfer ownership first." };
    }

    // 3. Fetch target user to prevent removing another OWNER
    const targetSnap = await adminDb.collection("users").doc(targetUserId).get();
    if (!targetSnap.exists) {
      return { success: false, error: "Target user not found." };
    }
    const targetData = targetSnap.data()!;
    
    if (targetData.role === "OWNER") {
      return { success: false, error: "Cannot remove an OWNER from the workspace." };
    }

    const targetName = targetData.name || "Unknown Operator";

    // 4. Atomic transaction: remove membership + unassign tasks
    await adminDb.runTransaction(async (tx) => {
      // Find all tasks assigned to this user in the project (or org if no project)
      let tasksQuery = adminDb.collection("tasks")
        .where("assignedTo", "array-contains", targetUserId);
      
      if (projectId) {
        tasksQuery = tasksQuery.where("projectId", "==", projectId);
      } else {
        tasksQuery = tasksQuery.where("orgId", "==", callerOrgId);
      }

      // Execute ALL reads first
      const tasksSnap = await tx.get(tasksQuery);

      // Execute ALL writes after reads
      // 1. Remove org membership from user
      tx.update(adminDb.collection("users").doc(targetUserId), {
        orgId: FieldValue.delete(),
        role: FieldValue.delete(),
      });

      // 2. Unassign each task
      tasksSnap.forEach((taskDoc) => {
        tx.update(taskDoc.ref, { assignedTo: FieldValue.arrayRemove(targetUserId) });
      });
    });

    // 7. Log activity (after transaction succeeds)
    const callerSnap = await adminDb.collection("users").doc(uid).get();
    const callerName = callerSnap.exists ? callerSnap.data()!.name || "Operator" : "System";

    await logActivity({
      eventType: "MEMBER_REMOVED",
      orgId: callerOrgId,
      projectId: projectId || null,
      actor: { uid, name: callerName },
      metadata: { targetUserId, targetName },
    });

    return { success: true };
  } catch (error: any) {
    console.error("[Remove Member Error]:", error);
    return { success: false, error: "Failed to remove member. Please try again." };
  }
}
