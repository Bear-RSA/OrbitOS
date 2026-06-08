"use server";

import { adminDb } from "@/lib/firebase/admin";
import { validateOwner } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/telemetry";

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
    const authStatus = await validateOwner(uid);
    if (!authStatus.isOwner) {
      console.error("[DeleteProject] Unauthorized deletion:", uid);
      return { success: false, error: authStatus.error };
    }
    const userOrgId = authStatus.orgId;

    // 2. Validate the project exists and belongs to the user's org
    const projectSnap = await adminDb.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) {
      console.error("[DeleteProject] Project not found:", projectId);
      return { success: false, error: "Project not found. It may have already been deleted." };
    }

    const projectData = projectSnap.data()!;
    if (projectData.orgId !== userOrgId) {
      console.error("[DeleteProject] Org mismatch:", {
        projectOrg: projectData.orgId,
        userOrg: userOrgId,
      });
      return { success: false, error: "Project does not belong to your workspace." };
    }
    const projectName = projectData.name || "Unknown Project";
    const userSnap = await adminDb.collection("users").doc(uid).get();
    const userName = userSnap.data()?.name || "System";

    // 2b. Log termination event (before deletion so info is still there)
    await logActivity({
      eventType: "PROJECT_TERMINATED",
      orgId: userOrgId,
      projectId,
      actor: { uid, name: userName },
      metadata: { projectId, projectName },
    });

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

interface ArchiveProjectPayload {
  projectId: string;
  uid: string;
}

export async function archiveProjectAction(
  payload: ArchiveProjectPayload
): Promise<{ success: boolean; error?: string }> {
  const { projectId, uid } = payload;

  console.log("[ArchiveProject] Starting archive:", { projectId, uid });

  try {
    // 1. Validate the authenticated user exists and is an owner
    const authStatus = await validateOwner(uid);
    if (!authStatus.isOwner) {
      console.error("[ArchiveProject] Unauthorized archive attempt:", uid);
      return { success: false, error: authStatus.error || "Unauthorized. Requires OWNER operations clearance." };
    }
    const userOrgId = authStatus.orgId;

    // 2. Validate the project exists and belongs to the user's org
    const projectSnap = await adminDb.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) {
      console.error("[ArchiveProject] Project not found:", projectId);
      return { success: false, error: "Project not found." };
    }

    const projectData = projectSnap.data()!;
    if (projectData.orgId !== userOrgId) {
      console.error("[ArchiveProject] Org mismatch:", {
        projectOrg: projectData.orgId,
        userOrg: userOrgId,
      });
      return { success: false, error: "Project does not belong to your workspace." };
    }

    const projectName = projectData.name || "Unknown Project";
    const userSnap = await adminDb.collection("users").doc(uid).get();
    const userName = userSnap.data()?.name || "System";

    // 3. Set archived flag on the project document
    await adminDb.collection("projects").doc(projectId).update({
      archived: true,
      archivedAt: new Date(),
      archivedBy: uid,
    });

    // 4. Log archive event
    await logActivity({
      eventType: "PROJECT_ARCHIVED",
      orgId: userOrgId,
      projectId,
      actor: { uid, name: userName },
      metadata: { projectId, projectName },
    });

    console.log("[ArchiveProject] Project archived:", projectId);
    return { success: true };
  } catch (error: any) {
    console.error("[ArchiveProject] Archive failed:", error);
    return {
      success: false,
      error: "Archive operation failed. Please try again or contact support.",
    };
  }
}

interface UpdateProjectPriorityPayload {
  uid: string;
  priorities: Array<{ projectId: string; priority: number }>;
}

export async function updateProjectPriorityAction(
  payload: UpdateProjectPriorityPayload
): Promise<{ success: boolean; error?: string }> {
  const { uid, priorities } = payload;

  console.log("[UpdateProjectPriority] Starting priority update:", { uid, count: priorities.length });

  try {
    // 1. Validate the authenticated user exists and is an owner
    const authStatus = await validateOwner(uid);
    if (!authStatus.isOwner) {
      console.error("[UpdateProjectPriority] Unauthorized priority update:", uid);
      return { success: false, error: authStatus.error || "Unauthorized. Requires OWNER operations clearance." };
    }
    const userOrgId = authStatus.orgId;

    // 2. Validate all projects exist and belong to the user's org
    const projectRefs = priorities.map(p =>
      adminDb.collection("projects").doc(p.projectId)
    );
    const projectSnaps = await Promise.all(projectRefs.map(ref => ref.get()));

    for (let i = 0; i < projectSnaps.length; i++) {
      const snap = projectSnaps[i];
      if (!snap.exists) {
        console.error("[UpdateProjectPriority] Project not found:", priorities[i].projectId);
        return { success: false, error: `Project ${priorities[i].projectId} not found.` };
      }
      if (snap.data()?.orgId !== userOrgId) {
        console.error("[UpdateProjectPriority] Org mismatch for project:", priorities[i].projectId);
        return { success: false, error: "One or more projects do not belong to your workspace." };
      }
    }

    // 3. Batch update all priorities atomically
    const batch = adminDb.batch();
    for (const { projectId, priority } of priorities) {
      const ref = adminDb.collection("projects").doc(projectId);
      batch.update(ref, { priority });
    }
    await batch.commit();

    console.log("[UpdateProjectPriority] Priorities updated successfully:", priorities.length, "projects");
    return { success: true };
  } catch (error: any) {
    console.error("[UpdateProjectPriority] Priority update failed:", error);
    return {
      success: false,
      error: "Priority update failed. Please try again or contact support.",
    };
  }
}

