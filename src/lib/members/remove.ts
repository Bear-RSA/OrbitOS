import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { dropFromInternalManagement } from "@/lib/internal-management/store";
import { logActivity } from "@/lib/telemetry";

/* ------------------------------------------------------------------ */
/*  Taking someone out of the workspace                                */
/*                                                                     */
/*  The write itself, shared by the Owner's remove button and by       */
/*  Internal Management applying an offboarding ticket. Each caller    */
/*  makes its own permission checks first; this file has no "use       */
/*  server", so no client can reach it directly.                       */
/* ------------------------------------------------------------------ */

export async function removeFromWorkspace(params: {
  orgId: string;
  targetUid: string;
  targetName: string;
  targetInInternalManagement: boolean;
  actor: { uid: string; name: string };
  /** Narrows the task unassignment to one project. */
  projectId?: string | null;
}): Promise<void> {
  const { orgId, targetUid, targetName, targetInInternalManagement, actor, projectId } = params;

  await adminDb.runTransaction(async (tx) => {
    let tasksQuery = adminDb.collection("tasks").where("assignedTo", "array-contains", targetUid);
    tasksQuery = projectId ? tasksQuery.where("projectId", "==", projectId) : tasksQuery.where("orgId", "==", orgId);

    // Every read before any write.
    const tasksSnap = await tx.get(tasksQuery);

    tx.update(adminDb.collection("users").doc(targetUid), {
      orgId: FieldValue.delete(),
      role: FieldValue.delete(),
      departmentId: FieldValue.delete(),
    });
    tasksSnap.forEach((taskDoc) => {
      tx.update(taskDoc.ref, { assignedTo: FieldValue.arrayRemove(targetUid) });
    });
  });

  if (targetInInternalManagement) await dropFromInternalManagement(orgId, targetUid);

  await logActivity({
    eventType: "MEMBER_REMOVED",
    orgId,
    projectId: projectId || null,
    actor,
    metadata: { targetUserId: targetUid, targetName },
  });
}
