"use server";

import { adminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp as AdminTimestamp } from "firebase-admin/firestore";

/* ------------------------------------------------------------------ */
/*  Task Server Actions                                                */
/*                                                                     */
/*  Operations that bypass client-side Firestore security rules by     */
/*  using the Admin SDK. This ensures Members can perform writes       */
/*  without being blocked by rule evaluation issues.                   */
/* ------------------------------------------------------------------ */

interface AddTaskNotePayload {
  taskId: string;
  content: string;
  createdBy: string;
}

/**
 * Adds a note to a task using the Admin SDK.
 * This bypasses Firestore client-side security rules which were causing
 * optimistic writes to be rolled back for Member-role users.
 */
export async function addTaskNoteAction(
  payload: AddTaskNotePayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const { taskId, content, createdBy } = payload;

    if (!taskId || !content.trim() || !createdBy) {
      return { success: false, error: "Missing required fields." };
    }

    // Verify the user exists and has an org
    const userSnap = await adminDb.collection("users").doc(createdBy).get();
    if (!userSnap.exists) {
      return { success: false, error: "User not found." };
    }

    const userData = userSnap.data()!;
    if (!userData.orgId) {
      return { success: false, error: "User has no organization assignment." };
    }

    // Verify the task exists and belongs to the same org
    const taskSnap = await adminDb.collection("tasks").doc(taskId).get();
    if (!taskSnap.exists) {
      return { success: false, error: "Task not found." };
    }

    const taskData = taskSnap.data()!;
    if (taskData.orgId !== userData.orgId) {
      return { success: false, error: "Unauthorized. Task belongs to a different organization." };
    }

    // Generate a unique note ID
    const noteId = `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Write the note using Admin SDK (bypasses security rules)
    await adminDb.collection("tasks").doc(taskId).update({
      taskNotes: FieldValue.arrayUnion({
        id: noteId,
        content: content.trim(),
        createdAt: AdminTimestamp.now(),
        createdBy,
      }),
      updatedAt: AdminTimestamp.now(),
      lastUpdatedAt: AdminTimestamp.now(),
    });

    console.log(`[TaskAction] Note added to task ${taskId} by ${createdBy}`);
    return { success: true };
  } catch (err: any) {
    console.error("[TaskAction] Failed to add note:", err);
    return { success: false, error: err.message || "Failed to add note." };
  }
}

/* ------------------------------------------------------------------ */
/*  Update Task Status                                                 */
/* ------------------------------------------------------------------ */

interface UpdateTaskStatusPayload {
  taskId: string;
  status: string;
  previousStatus: string;
  uid: string;
}

export async function updateTaskStatusAction(
  payload: UpdateTaskStatusPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const { taskId, status, previousStatus, uid } = payload;

    // Verify org membership
    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists || !userSnap.data()?.orgId) {
      return { success: false, error: "Unauthorized." };
    }

    const taskSnap = await adminDb.collection("tasks").doc(taskId).get();
    if (!taskSnap.exists) {
      return { success: false, error: "Task not found." };
    }

    if (taskSnap.data()!.orgId !== userSnap.data()!.orgId) {
      return { success: false, error: "Unauthorized. Task belongs to a different organization." };
    }

    const now = AdminTimestamp.now();
    const updates: Record<string, any> = {
      status,
      updatedAt: now,
      lastUpdatedAt: now,
    };

    if (status === "done" && previousStatus !== "done") {
      updates.completedAt = now;
    }
    if (status !== "done" && previousStatus === "done") {
      updates.completedAt = null;
    }

    await adminDb.collection("tasks").doc(taskId).update(updates);
    console.log(`[TaskAction] Status updated for ${taskId}: ${previousStatus} → ${status}`);
    return { success: true };
  } catch (err: any) {
    console.error("[TaskAction] Failed to update task status:", err);
    return { success: false, error: err.message || "Failed to update status." };
  }
}

/* ------------------------------------------------------------------ */
/*  Toggle Task Blocked                                                */
/* ------------------------------------------------------------------ */

interface ToggleTaskBlockedPayload {
  taskId: string;
  isBlocked: boolean;
  uid: string;
  blockedReason?: string;
}

export async function toggleTaskBlockedAction(
  payload: ToggleTaskBlockedPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const { taskId, isBlocked, uid, blockedReason } = payload;

    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists || !userSnap.data()?.orgId) {
      return { success: false, error: "Unauthorized." };
    }

    const taskSnap = await adminDb.collection("tasks").doc(taskId).get();
    if (!taskSnap.exists) {
      return { success: false, error: "Task not found." };
    }

    if (taskSnap.data()!.orgId !== userSnap.data()!.orgId) {
      return { success: false, error: "Unauthorized." };
    }

    const now = AdminTimestamp.now();
    await adminDb.collection("tasks").doc(taskId).update({
      isBlocked,
      blockedReason: isBlocked ? (blockedReason || "") : "",
      updatedAt: now,
      lastUpdatedAt: now,
    });

    console.log(`[TaskAction] Blocked toggled for ${taskId}: ${isBlocked}`);
    return { success: true };
  } catch (err: any) {
    console.error("[TaskAction] Failed to toggle blocked:", err);
    return { success: false, error: err.message || "Failed to toggle blocked state." };
  }
}

/* ------------------------------------------------------------------ */
/*  Delete Task                                                        */
/* ------------------------------------------------------------------ */

interface DeleteTaskPayload {
  taskId: string;
  uid: string;
}

export async function deleteTaskAction(
  payload: DeleteTaskPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const { taskId, uid } = payload;
    console.log(`[TaskAction:Delete] Starting delete for task=${taskId} by uid=${uid}`);

    const userSnap = await adminDb.collection("users").doc(uid).get();
    console.log(`[TaskAction:Delete] User doc exists=${userSnap.exists}, orgId=${userSnap.data()?.orgId}, role=${userSnap.data()?.role}`);
    if (!userSnap.exists || !userSnap.data()?.orgId) {
      return { success: false, error: "Unauthorized." };
    }

    const taskSnap = await adminDb.collection("tasks").doc(taskId).get();
    console.log(`[TaskAction:Delete] Task doc exists=${taskSnap.exists}, taskOrgId=${taskSnap.data()?.orgId}`);
    if (!taskSnap.exists) {
      return { success: false, error: "Task not found." };
    }

    if (taskSnap.data()!.orgId !== userSnap.data()!.orgId) {
      console.log(`[TaskAction:Delete] Org mismatch: task.orgId=${taskSnap.data()!.orgId} vs user.orgId=${userSnap.data()!.orgId}`);
      return { success: false, error: "Unauthorized." };
    }

    console.log(`[TaskAction:Delete] All checks passed. Executing admin delete...`);
    await adminDb.collection("tasks").doc(taskId).delete();
    console.log(`[TaskAction:Delete] SUCCESS - Task ${taskId} deleted by ${uid}`);
    return { success: true };
  } catch (err: any) {
    console.error("[TaskAction:Delete] CAUGHT ERROR:", err?.code, err?.message, err);
    return { success: false, error: err.message || "Failed to delete task." };
  }
}

/* ------------------------------------------------------------------ */
/*  Update Task (General Fields)                                       */
/* ------------------------------------------------------------------ */

interface UpdateTaskPayload {
  taskId: string;
  uid: string;
  updates: {
    title?: string;
    description?: string;
    assignedTo?: string | null;
    milestone?: string;
    dueDate?: string | null; // ISO string — converted server-side
  };
}

export async function updateTaskAction(
  payload: UpdateTaskPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const { taskId, uid, updates } = payload;

    const userSnap = await adminDb.collection("users").doc(uid).get();
    if (!userSnap.exists || !userSnap.data()?.orgId) {
      return { success: false, error: "Unauthorized." };
    }

    const taskSnap = await adminDb.collection("tasks").doc(taskId).get();
    if (!taskSnap.exists) {
      return { success: false, error: "Task not found." };
    }

    if (taskSnap.data()!.orgId !== userSnap.data()!.orgId) {
      return { success: false, error: "Unauthorized." };
    }

    const now = AdminTimestamp.now();
    const firestoreUpdates: Record<string, any> = {
      updatedAt: now,
      lastUpdatedAt: now,
    };

    if (updates.title !== undefined) firestoreUpdates.title = updates.title;
    if (updates.description !== undefined) firestoreUpdates.description = updates.description;
    if (updates.assignedTo !== undefined) firestoreUpdates.assignedTo = updates.assignedTo;
    if (updates.milestone !== undefined) firestoreUpdates.milestone = updates.milestone;
    if (updates.dueDate !== undefined) {
      firestoreUpdates.dueDate = updates.dueDate
        ? AdminTimestamp.fromDate(new Date(updates.dueDate))
        : null;
    }

    await adminDb.collection("tasks").doc(taskId).update(firestoreUpdates);
    console.log(`[TaskAction] Task ${taskId} updated by ${uid}`);
    return { success: true };
  } catch (err: any) {
    console.error("[TaskAction] Failed to update task:", err);
    return { success: false, error: err.message || "Failed to update task." };
  }
}

/* ------------------------------------------------------------------ */
/*  Create Task                                                        */
/* ------------------------------------------------------------------ */

interface CreateTaskPayload {
  orgId: string;
  projectId: string;
  title: string;
  description?: string;
  assignedTo?: string | null;
  milestone?: string;
  createdBy: string;
  dueDate?: string | null; // ISO string — converted server-side
}

export async function createTaskAction(
  payload: CreateTaskPayload
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  try {
    const { orgId, projectId, title, description, assignedTo, milestone, createdBy, dueDate } = payload;

    if (!title.trim()) {
      return { success: false, error: "Title is required." };
    }

    // Verify the user exists and belongs to the org
    const userSnap = await adminDb.collection("users").doc(createdBy).get();
    if (!userSnap.exists) {
      return { success: false, error: "User not found." };
    }
    const userData = userSnap.data()!;
    if (userData.orgId !== orgId) {
      return { success: false, error: "Unauthorized. Org mismatch." };
    }

    // Verify the project exists
    const projectSnap = await adminDb.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) {
      return { success: false, error: "Project not found." };
    }

    const now = AdminTimestamp.now();
    const taskData: Record<string, any> = {
      title: title.trim(),
      description: description || "",
      projectId,
      orgId,
      assignedTo: assignedTo || null,
      milestone: milestone || "Unassigned",
      createdBy,
      dueDate: dueDate ? AdminTimestamp.fromDate(new Date(dueDate)) : null,
      status: "todo",
      isBlocked: false,
      taskNotes: [],
      createdAt: now,
      updatedAt: now,
      lastUpdatedAt: now,
      completedAt: null,
    };

    const ref = await adminDb.collection("tasks").add(taskData);
    console.log(`[TaskAction] Task created: ${ref.id} by ${createdBy}`);
    return { success: true, taskId: ref.id };
  } catch (err: any) {
    console.error("[TaskAction] Failed to create task:", err);
    return { success: false, error: err.message || "Failed to create task." };
  }
}
