"use server";

import { adminDb } from "@/lib/firebase/admin";

interface DeleteProjectPayload {
  projectId: string;
  uid: string;
}

export async function deleteProjectAction(
  payload: DeleteProjectPayload
): Promise<{ success: boolean; error?: string; deletedTasks?: number }> {
  const { projectId, uid } = payload;

  console.log("[DeleteProject] Starting deletion:", { projectId, uid });

  try {
    // 1. Validate the authenticated user exists and is an owner
    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      console.error("[DeleteProject] User not found:", uid);
      return { success: false, error: "Authenticated user profile not found." };
    }

    const userData = userSnap.data()!;
    if (userData.role !== "owner") {
      console.error("[DeleteProject] Non-owner attempted deletion:", uid, userData.role);
      return { success: false, error: "Only workspace owners can delete projects." };
    }

    if (!userData.orgId) {
      console.error("[DeleteProject] User has no org:", uid);
      return { success: false, error: "User is not assigned to a workspace." };
    }

    // 2. Validate the project exists and belongs to the user's org
    const projectSnap = await adminDb.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) {
      console.error("[DeleteProject] Project not found:", projectId);
      return { success: false, error: "Project not found. It may have already been deleted." };
    }

    const projectData = projectSnap.data()!;
    if (projectData.orgId !== userData.orgId) {
      console.error("[DeleteProject] Org mismatch:", {
        projectOrg: projectData.orgId,
        userOrg: userData.orgId,
      });
      return { success: false, error: "Project does not belong to your workspace." };
    }

    // 3. Find all tasks linked to this project
    const tasksSnapshot = await adminDb
      .collection("tasks")
      .where("projectId", "==", projectId)
      .get();

    console.log("[DeleteProject] Found", tasksSnapshot.size, "tasks to cascade delete");

    // 4. Cascade delete in batches (Firestore max 500 ops per batch)
    const BATCH_LIMIT = 499; // Reserve 1 slot for the project doc itself in the last batch
    const taskDocs = tasksSnapshot.docs;
    let deletedTasks = 0;

    if (taskDocs.length > 0) {
      // Process tasks in chunks
      for (let i = 0; i < taskDocs.length; i += BATCH_LIMIT) {
        const chunk = taskDocs.slice(i, i + BATCH_LIMIT);
        const batch = adminDb.batch();

        for (const taskDoc of chunk) {
          batch.delete(taskDoc.ref);
        }

        // If this is the last chunk and it has room, include the project delete
        const isLastChunk = i + BATCH_LIMIT >= taskDocs.length;
        if (isLastChunk && chunk.length < BATCH_LIMIT) {
          batch.delete(adminDb.collection("projects").doc(projectId));
        }

        await batch.commit();
        deletedTasks += chunk.length;

        console.log(
          `[DeleteProject] Batch committed: ${chunk.length} tasks deleted (total: ${deletedTasks})`
        );

        // If the project was included in the last batch, we're done
        if (isLastChunk && chunk.length < BATCH_LIMIT) {
          console.log("[DeleteProject] Project deleted in final batch");
          return { success: true, deletedTasks };
        }
      }
    }

    // 5. Delete the project document (if not already deleted in a batch above)
    await adminDb.collection("projects").doc(projectId).delete();
    console.log("[DeleteProject] Project document deleted:", projectId);

    return { success: true, deletedTasks };
  } catch (error: any) {
    console.error("[DeleteProject] Cascade deletion failed:", error);
    return {
      success: false,
      error: "Deletion cascade failed. Please try again or contact support.",
    };
  }
}
