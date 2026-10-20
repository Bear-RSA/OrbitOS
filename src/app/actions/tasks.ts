"use server";

import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/lib/auth/session";
import { requireCaller } from "@/lib/auth/caller";
import {
  addTaskNote,
  createTask,
  setTaskBlocked,
  setTaskStatus,
  updateTask,
  type TaskActor,
} from "@/lib/tasks/core";
import type { TaskStatus } from "@/types/task";

/* ------------------------------------------------------------------ */
/*  Task Server Actions                                                */
/*                                                                     */
/*  Operations that bypass client-side Firestore security rules by     */
/*  using the Admin SDK. This ensures Members can perform writes       */
/*  without being blocked by rule evaluation issues.                   */
/*                                                                     */
/*  The writes themselves live in `lib/tasks/core`, shared with the    */
/*  `/api/v1` routes. These actions only answer "who is calling" from  */
/*  the session cookie and hand the actor over, so the app and an      */
/*  assistant holding a token go through the same checks and the same  */
/*  activity log.                                                      */
/* ------------------------------------------------------------------ */

/** The session's caller as a task actor, or the error to return. */
async function sessionActor(): Promise<{ actor: TaskActor } | { error: string }> {
  const caller = await requireCaller();
  if (!caller.ok) return { error: caller.error };
  return { actor: { uid: caller.uid, orgId: caller.orgId, name: caller.name } };
}

/** Never lets an unexpected throw reach the client as a rejected promise. */
async function guarded<T extends { success: boolean; error?: string }>(
  label: string,
  fallback: string,
  run: (actor: TaskActor) => Promise<T>
): Promise<T | { success: false; error: string }> {
  try {
    const resolved = await sessionActor();
    if ("error" in resolved) return { success: false, error: resolved.error };
    return await run(resolved.actor);
  } catch (err: any) {
    console.error(`[TaskAction] Failed to ${label}:`, err);
    return { success: false, error: err.message || fallback };
  }
}

interface AddTaskNotePayload {
  taskId: string;
  content: string;
  /** @deprecated Ignored — the author's identity comes from the session. */
  createdBy?: string;
}

/** Adds a note to a task. */
export async function addTaskNoteAction(
  payload: AddTaskNotePayload
): Promise<{ success: boolean; error?: string }> {
  return guarded("add note", "Failed to add note.", (actor) =>
    addTaskNote(actor, payload.taskId, payload.content)
  );
}

/* ------------------------------------------------------------------ */
/*  Update Task Status                                                 */
/* ------------------------------------------------------------------ */

interface UpdateTaskStatusPayload {
  taskId: string;
  status: string;
  /** @deprecated Ignored — the current status is read from the task. */
  previousStatus?: string;
  /** @deprecated Ignored — the caller's identity comes from the session. */
  uid?: string;
}

export async function updateTaskStatusAction(
  payload: UpdateTaskStatusPayload
): Promise<{ success: boolean; error?: string }> {
  return guarded("update task status", "Failed to update status.", (actor) =>
    setTaskStatus(actor, payload.taskId, payload.status as TaskStatus)
  );
}

/* ------------------------------------------------------------------ */
/*  Toggle Task Blocked                                                */
/* ------------------------------------------------------------------ */

interface ToggleTaskBlockedPayload {
  taskId: string;
  isBlocked: boolean;
  /** @deprecated Ignored — the caller's identity comes from the session. */
  uid?: string;
  blockedReason?: string;
}

export async function toggleTaskBlockedAction(
  payload: ToggleTaskBlockedPayload
): Promise<{ success: boolean; error?: string }> {
  return guarded("toggle blocked", "Failed to toggle blocked state.", (actor) =>
    setTaskBlocked(actor, payload.taskId, payload.isBlocked, payload.blockedReason)
  );
}

/* ------------------------------------------------------------------ */
/*  Delete Task                                                        */
/*                                                                     */
/*  Not in the shared core on purpose: the API does not offer delete,  */
/*  so an assistant can lose nobody's work.                            */
/* ------------------------------------------------------------------ */

interface DeleteTaskPayload {
  taskId: string;
  /** @deprecated Ignored — the caller's identity comes from the session. */
  uid?: string;
}

export async function deleteTaskAction(
  payload: DeleteTaskPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const { taskId } = payload;

    const session = await getServerSession();
    if (!session) {
      return { success: false, error: "Your session has expired. Sign in again." };
    }
    const uid = session.uid;

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

    await adminDb.collection("tasks").doc(taskId).delete();
    console.log(`[TaskAction:Delete] Task ${taskId} deleted by ${uid}`);
    return { success: true };
  } catch (err: any) {
    console.error("[TaskAction:Delete] Failed:", err?.code, err?.message, err);
    return { success: false, error: err.message || "Failed to delete task." };
  }
}

/* ------------------------------------------------------------------ */
/*  Update Task (General Fields)                                       */
/* ------------------------------------------------------------------ */

interface UpdateTaskPayload {
  taskId: string;
  /** @deprecated Ignored — the caller's identity comes from the session. */
  uid?: string;
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
  return guarded("update task", "Failed to update task.", (actor) =>
    updateTask(actor, payload.taskId, payload.updates)
  );
}

/* ------------------------------------------------------------------ */
/*  Create Task                                                        */
/* ------------------------------------------------------------------ */

interface CreateTaskPayload {
  /** @deprecated Ignored — the workspace comes from the caller's session. */
  orgId?: string;
  projectId: string;
  title: string;
  description?: string;
  assignedTo?: string[];
  milestone?: string;
  /** @deprecated Ignored — the author's identity comes from the session. */
  createdBy?: string;
  dueDate?: string | null; // ISO string — converted server-side
}

export async function createTaskAction(
  payload: CreateTaskPayload
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  return guarded("create task", "Failed to create task.", (actor) =>
    createTask(actor, {
      projectId: payload.projectId,
      title: payload.title,
      description: payload.description,
      assignedTo: payload.assignedTo,
      milestone: payload.milestone,
      dueDate: payload.dueDate,
    })
  );
}
