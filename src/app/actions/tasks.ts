"use server";

import { adminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { coerceDateKey, dateKeyToInstant } from "@/lib/utils/dates";
import { logActivity } from "@/lib/telemetry";

/* ------------------------------------------------------------------ */
/*  Task Server Actions                                                */
/*                                                                     */
/*  Operations that bypass client-side Firestore security rules by     */
/*  using the Admin SDK. This ensures Members can perform writes       */
/*  without being blocked by rule evaluation issues.                   */
/*                                                                     */
/*  These actions also own the activity log for the four task events   */
/*  that matter downstream — created, assigned, moved, completed.      */
/*  They used to be logged from the components that call these actions */
/*  instead, as unawaited `recordTelemetryAction` calls. That lost     */
/*  events two ways: any caller reaching an action from somewhere      */
/*  other than those components logged nothing at all, and a           */
/*  fire-and-forget promise on Vercel races the freeze that follows    */
/*  the response. The end-of-day debrief reads this log as its only    */
/*  record of what happened during a day — task documents hold current */
/*  state and no history — so a dropped event is a gap nothing else    */
/*  can reconstruct. Logging on the write path, awaited, closes both.  */
/* ------------------------------------------------------------------ */

/** The display names for a set of uids, for readable log entries. */
async function namesFor(uids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (uids.length === 0) return names;

  const refs = uids.map((uid) => adminDb.collection("users").doc(uid));
  const snaps = await adminDb.getAll(...refs);
  for (const snap of snaps) {
    if (snap.exists) names.set(snap.id, snap.data()?.name || "Operator");
  }
  return names;
}

/**
 * Records an assignment against every named assignee.
 *
 * `assigneeUids` carries the uids as well as the names because the debrief
 * groups by recipient: "assigned to you today" is a query for events whose
 * assignees include a person, and a display name cannot answer that.
 */
async function logAssignment(params: {
  orgId: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
  actor: { uid: string; name: string };
  assigneeUids: string[];
}): Promise<void> {
  if (params.assigneeUids.length === 0) return;

  const names = await namesFor(params.assigneeUids);

  await logActivity({
    eventType: "DIRECTIVE_ASSIGNED",
    orgId: params.orgId,
    projectId: params.projectId,
    actor: params.actor,
    metadata: {
      taskId: params.taskId,
      taskTitle: params.taskTitle,
      assigneeUids: params.assigneeUids,
      assigneeName: params.assigneeUids
        .map((uid) => names.get(uid) ?? "Operator")
        .join(", "),
    },
  });
}

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

    const task = taskSnap.data()!;

    /* Completion is a transition to "done" rather than an event of its own,
       which is how the in-app feed has always recorded it. The debrief
       splits the two apart when it reads them, so a task moved to done
       lands under Completed and everything else under Moved. */
    await logActivity({
      eventType: "DIRECTIVE_TRANSITION",
      orgId: task.orgId,
      projectId: task.projectId ?? null,
      actor: { uid, name: userSnap.data()!.name || "Operator" },
      metadata: {
        taskId,
        taskTitle: task.title,
        from: previousStatus,
        to: status,
        assigneeUids: Array.isArray(task.assignedTo) ? task.assignedTo : [],
      },
    });

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
    assignedTo?: string[];
    milestone?: string;
    dueDate?: string | null; // ISO string — converted server-side
  };
}

export async function updateTaskAction(
  payload: UpdateTaskPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const { taskId, uid, updates } = payload;

    // Server-side enforcement: max 2 operatives
    if (updates.assignedTo && updates.assignedTo.length > 2) {
      return { success: false, error: "Maximum 2 operatives allowed per directive." };
    }

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
      // The key is the authority on the day; the Timestamp only sorts.
      const key = coerceDateKey(updates.dueDate);
      firestoreUpdates.dueDateKey = key;
      firestoreUpdates.dueDate = key
        ? AdminTimestamp.fromDate(dateKeyToInstant(key))
        : null;
    }

    await adminDb.collection("tasks").doc(taskId).update(firestoreUpdates);
    console.log(`[TaskAction] Task ${taskId} updated by ${uid}`);

    const previous = taskSnap.data()!;
    const actor = { uid, name: userSnap.data()!.name || "Operator" };
    const taskTitle = updates.title ?? previous.title;
    const projectId = previous.projectId ?? null;

    /* Only genuinely new assignees. Re-saving the edit dialog resends the
       same array, and logging that as an assignment would tell the debrief
       somebody was handed work they have had all along. */
    const before: string[] = Array.isArray(previous.assignedTo)
      ? previous.assignedTo
      : [];
    const added =
      updates.assignedTo !== undefined
        ? updates.assignedTo.filter((assignee) => !before.includes(assignee))
        : [];

    if (added.length > 0) {
      await logAssignment({
        orgId: previous.orgId,
        projectId,
        taskId,
        taskTitle,
        actor,
        assigneeUids: added,
      });
    }

    /* An edit that only moved people is already described by the assignment
       above; a second "revised" row beside it says nothing extra. */
    const editedFields = Object.keys(updates).filter(
      (field) => field !== "assignedTo"
    );

    if (editedFields.length > 0) {
      await logActivity({
        eventType: "DIRECTIVE_EDITED",
        orgId: previous.orgId,
        projectId,
        actor,
        metadata: { taskId, taskTitle, field: editedFields.join(", ") },
      });
    }

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
  assignedTo?: string[];
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

    // Server-side enforcement: max 2 operatives
    if (assignedTo && assignedTo.length > 2) {
      return { success: false, error: "Maximum 2 operatives allowed per directive." };
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
    // The key is the authority on the day; the Timestamp only sorts.
    const dueDateKey = coerceDateKey(dueDate);
    const taskData: Record<string, any> = {
      title: title.trim(),
      description: description || "",
      projectId,
      orgId,
      assignedTo: assignedTo && assignedTo.length > 0 ? assignedTo : [],
      milestone: milestone || "Unassigned",
      createdBy,
      dueDateKey,
      dueDate: dueDateKey ? AdminTimestamp.fromDate(dateKeyToInstant(dueDateKey)) : null,
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

    const actor = { uid: createdBy, name: userData.name || "Operator" };

    await logActivity({
      eventType: "DIRECTIVE_CREATED",
      orgId,
      projectId,
      actor,
      metadata: { taskId: ref.id, taskTitle: taskData.title, dueDateKey },
    });

    // Creating a task with people already on it is an assignment too — the
    // debrief's "assigned to you" section would otherwise miss every task
    // that was assigned at the moment it was created, which is most of them.
    await logAssignment({
      orgId,
      projectId,
      taskId: ref.id,
      taskTitle: taskData.title,
      actor,
      assigneeUids: taskData.assignedTo,
    });

    return { success: true, taskId: ref.id };
  } catch (err: any) {
    console.error("[TaskAction] Failed to create task:", err);
    return { success: false, error: err.message || "Failed to create task." };
  }
}
