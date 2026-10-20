import { FieldValue, Timestamp as AdminTimestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { coerceDateKey, dateKeyToInstant } from "@/lib/utils/dates";
import { logActivity } from "@/lib/telemetry";
import type { TaskStatus } from "@/types/task";

/* ------------------------------------------------------------------ */
/*  Task core                                                          */
/*                                                                     */
/*  The writes behind every task operation, with the identity passed   */
/*  in rather than read from a cookie. Two front doors lead here: the  */
/*  server actions in `app/actions/tasks`, which resolve the actor     */
/*  from the session, and the `/api/v1` routes, which resolve it from  */
/*  a bearer token. Keeping one copy means an assistant creating a     */
/*  task gets the same checks and the same activity log as a person    */
/*  clicking the button — the debrief cannot tell them apart, and      */
/*  should not need to.                                                */
/*                                                                     */
/*  These also own the activity log for the four task events that      */
/*  matter downstream — created, assigned, moved, completed — awaited  */
/*  on the write path so a Vercel freeze cannot drop one.              */
/* ------------------------------------------------------------------ */

export interface TaskActor {
  uid: string;
  orgId: string;
  name: string;
}

export type CoreResult<T = object> = ({ success: true } & T) | { success: false; error: string };

export const TASK_STATUSES: readonly TaskStatus[] = ["todo", "doing", "done"];

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

/** The display names for a set of uids, for readable log entries. */
async function namesFor(uids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (uids.length === 0) return names;

  const refs = uids.map((uid) => adminDb.collection("users").doc(uid));
  const snaps = await adminDb.getAll(...refs);
  for (const snap of snaps) {
    if (snap.exists) names.set(snap.id, snap.data()?.name || "Unnamed member");
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
        .map((uid) => names.get(uid) ?? "Unnamed member")
        .join(", "),
    },
  });
}

/**
 * Refuses any assignee who is not in the actor's workspace. A uid from
 * outside would put a task on a stranger's calendar feed and debrief.
 */
async function checkAssignees(orgId: string, uids: string[]): Promise<string | null> {
  const unique = Array.from(new Set(uids));
  if (unique.length === 0) return null;
  if (unique.some((uid) => typeof uid !== "string" || !uid)) return "Assignees must be member ids.";

  const snaps = await adminDb.getAll(...unique.map((uid) => adminDb.collection("users").doc(uid)));
  const outsider = snaps.find((snap) => !snap.exists || snap.data()?.orgId !== orgId);
  return outsider ? `Member ${outsider.id} is not in this workspace.` : null;
}

/** Loads a task the actor's workspace owns, or says why not. */
async function loadOwnTask(actor: TaskActor, taskId: string) {
  if (!taskId) return { error: "Task not found." } as const;
  const snap = await adminDb.collection("tasks").doc(taskId).get();
  if (!snap.exists) return { error: "Task not found." } as const;
  if (snap.data()!.orgId !== actor.orgId) {
    return { error: "Unauthorized. Task belongs to a different organization." } as const;
  }
  return { snap } as const;
}

/* ------------------------------------------------------------------ */
/*  Writes                                                             */
/* ------------------------------------------------------------------ */

export interface CreateTaskFields {
  projectId: string;
  title: string;
  description?: string;
  assignedTo?: string[];
  milestone?: string;
  dueDate?: string | null;
}

export async function createTask(
  actor: TaskActor,
  fields: CreateTaskFields
): Promise<CoreResult<{ taskId: string }>> {
  const { projectId, title, description, assignedTo, milestone, dueDate } = fields;

  if (!title || !title.trim()) return { success: false, error: "Title is required." };
  if (!projectId) return { success: false, error: "Project is required." };

  const projectSnap = await adminDb.collection("projects").doc(projectId).get();
  if (!projectSnap.exists || projectSnap.data()?.orgId !== actor.orgId) {
    return { success: false, error: "Project not found." };
  }

  const assignees = Array.from(new Set(assignedTo ?? []));
  const assigneeError = await checkAssignees(actor.orgId, assignees);
  if (assigneeError) return { success: false, error: assigneeError };

  const now = AdminTimestamp.now();
  // The key is the authority on the day; the Timestamp only sorts.
  const dueDateKey = coerceDateKey(dueDate);
  const taskData: Record<string, any> = {
    title: title.trim(),
    description: description || "",
    projectId,
    orgId: actor.orgId,
    assignedTo: assignees,
    milestone: milestone || "Unassigned",
    createdBy: actor.uid,
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
  console.log(`[TaskAction] Task created: ${ref.id} by ${actor.uid}`);

  const logActor = { uid: actor.uid, name: actor.name };

  await logActivity({
    eventType: "DIRECTIVE_CREATED",
    orgId: actor.orgId,
    projectId,
    actor: logActor,
    metadata: { taskId: ref.id, taskTitle: taskData.title, dueDateKey },
  });

  // Creating a task with people already on it is an assignment too — the
  // debrief's "assigned to you" section would otherwise miss every task
  // that was assigned at the moment it was created, which is most of them.
  await logAssignment({
    orgId: actor.orgId,
    projectId,
    taskId: ref.id,
    taskTitle: taskData.title,
    actor: logActor,
    assigneeUids: assignees,
  });

  return { success: true, taskId: ref.id };
}

export interface UpdateTaskFields {
  title?: string;
  description?: string;
  assignedTo?: string[];
  milestone?: string;
  dueDate?: string | null;
}

export async function updateTask(
  actor: TaskActor,
  taskId: string,
  updates: UpdateTaskFields
): Promise<CoreResult> {
  const loaded = await loadOwnTask(actor, taskId);
  if ("error" in loaded) return { success: false, error: loaded.error! };

  if (updates.title !== undefined && !updates.title.trim()) {
    return { success: false, error: "Title cannot be empty." };
  }
  if (updates.assignedTo !== undefined) {
    updates = { ...updates, assignedTo: Array.from(new Set(updates.assignedTo)) };
    const assigneeError = await checkAssignees(actor.orgId, updates.assignedTo!);
    if (assigneeError) return { success: false, error: assigneeError };
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
  console.log(`[TaskAction] Task ${taskId} updated by ${actor.uid}`);

  const previous = loaded.snap.data()!;
  const logActor = { uid: actor.uid, name: actor.name };
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
      actor: logActor,
      assigneeUids: added,
    });
  }

  /* An edit that only moved people is already described by the assignment
     above; a second "revised" row beside it says nothing extra. */
  const editedFields = Object.keys(updates).filter(
    (field) => field !== "assignedTo" && updates[field as keyof UpdateTaskFields] !== undefined
  );

  if (editedFields.length > 0) {
    await logActivity({
      eventType: "DIRECTIVE_EDITED",
      orgId: previous.orgId,
      projectId,
      actor: logActor,
      metadata: { taskId, taskTitle, field: editedFields.join(", ") },
    });
  }

  return { success: true };
}

/**
 * Moves a task between columns. The "from" side is read from the
 * document, not trusted from the caller, so the log records what the
 * task actually was.
 */
export async function setTaskStatus(
  actor: TaskActor,
  taskId: string,
  status: TaskStatus
): Promise<CoreResult> {
  if (!isTaskStatus(status)) return { success: false, error: "Status must be todo, doing, or done." };

  const loaded = await loadOwnTask(actor, taskId);
  if ("error" in loaded) return { success: false, error: loaded.error! };

  const task = loaded.snap.data()!;
  const previousStatus = task.status as string;

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

  /* Completion is a transition to "done" rather than an event of its own,
     which is how the in-app feed has always recorded it. The debrief
     splits the two apart when it reads them, so a task moved to done
     lands under Completed and everything else under Moved. */
  await logActivity({
    eventType: "DIRECTIVE_TRANSITION",
    orgId: task.orgId,
    projectId: task.projectId ?? null,
    actor: { uid: actor.uid, name: actor.name },
    metadata: {
      taskId,
      taskTitle: task.title,
      from: previousStatus,
      to: status,
      assigneeUids: Array.isArray(task.assignedTo) ? task.assignedTo : [],
    },
  });

  return { success: true };
}

export async function setTaskBlocked(
  actor: TaskActor,
  taskId: string,
  isBlocked: boolean,
  blockedReason?: string
): Promise<CoreResult> {
  const loaded = await loadOwnTask(actor, taskId);
  if ("error" in loaded) return { success: false, error: loaded.error! };

  const now = AdminTimestamp.now();
  await adminDb.collection("tasks").doc(taskId).update({
    isBlocked,
    blockedReason: isBlocked ? (blockedReason || "") : "",
    updatedAt: now,
    lastUpdatedAt: now,
  });

  console.log(`[TaskAction] Blocked toggled for ${taskId}: ${isBlocked}`);
  return { success: true };
}

/** Longest note the API accepts; an assistant pasting a whole report is the case this stops. */
export const MAX_NOTE_LENGTH = 5000;

export async function addTaskNote(
  actor: TaskActor,
  taskId: string,
  content: string
): Promise<CoreResult<{ noteId: string }>> {
  if (!taskId || typeof content !== "string" || !content.trim()) {
    return { success: false, error: "Missing required fields." };
  }
  if (content.length > MAX_NOTE_LENGTH) {
    return { success: false, error: `Notes are limited to ${MAX_NOTE_LENGTH} characters.` };
  }

  const loaded = await loadOwnTask(actor, taskId);
  if ("error" in loaded) return { success: false, error: loaded.error! };

  const noteId = `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await adminDb.collection("tasks").doc(taskId).update({
    taskNotes: FieldValue.arrayUnion({
      id: noteId,
      content: content.trim(),
      createdAt: AdminTimestamp.now(),
      createdBy: actor.uid,
    }),
    updatedAt: AdminTimestamp.now(),
    lastUpdatedAt: AdminTimestamp.now(),
  });

  console.log(`[TaskAction] Note added to task ${taskId} by ${actor.uid}`);
  return { success: true, noteId };
}

/* ------------------------------------------------------------------ */
/*  Reads                                                              */
/*                                                                     */
/*  Shaped for a reader outside the app: instants as ISO strings, the  */
/*  people behind each uid named, the project named. An assistant      */
/*  asked "what's on my plate" should not need three follow-up calls   */
/*  to say who assigned what.                                          */
/* ------------------------------------------------------------------ */

function iso(value: unknown): string | null {
  return value instanceof AdminTimestamp ? value.toDate().toISOString() : null;
}

export interface TaskView {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  isBlocked: boolean;
  blockedReason: string | null;
  projectId: string;
  projectName: string | null;
  milestone: string | null;
  dueDate: string | null;
  assignees: { id: string; name: string }[];
  createdBy: { id: string; name: string };
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  notes?: { id: string; content: string; createdAt: string | null; author: { id: string; name: string } }[];
}

async function projectNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return names;
  const snaps = await adminDb.getAll(...unique.map((id) => adminDb.collection("projects").doc(id)));
  for (const snap of snaps) if (snap.exists) names.set(snap.id, snap.data()?.name || "Untitled project");
  return names;
}

async function toViews(
  docs: FirebaseFirestore.DocumentSnapshot[],
  withNotes: boolean
): Promise<TaskView[]> {
  const rows = docs.map((doc) => ({ id: doc.id, data: doc.data()! }));

  const uids = new Set<string>();
  for (const { data } of rows) {
    for (const uid of Array.isArray(data.assignedTo) ? data.assignedTo : []) uids.add(uid);
    if (data.createdBy) uids.add(data.createdBy);
    if (withNotes) for (const note of data.taskNotes ?? []) if (note?.createdBy) uids.add(note.createdBy);
  }

  const [people, projects] = await Promise.all([
    namesFor(Array.from(uids)),
    projectNames(rows.map(({ data }) => data.projectId)),
  ]);
  const person = (id: string) => ({ id, name: people.get(id) ?? "Unknown member" });

  return rows.map(({ id, data }) => {
    const view: TaskView = {
      id,
      title: data.title ?? "",
      description: data.description ?? "",
      status: isTaskStatus(data.status) ? data.status : "todo",
      isBlocked: Boolean(data.isBlocked),
      blockedReason: data.isBlocked ? data.blockedReason || null : null,
      projectId: data.projectId ?? "",
      projectName: projects.get(data.projectId) ?? null,
      milestone: data.milestone ?? null,
      dueDate: data.dueDateKey ?? null,
      assignees: (Array.isArray(data.assignedTo) ? data.assignedTo : []).map(person),
      createdBy: person(data.createdBy ?? ""),
      createdAt: iso(data.createdAt),
      updatedAt: iso(data.updatedAt),
      completedAt: iso(data.completedAt),
    };
    if (withNotes) {
      view.notes = (Array.isArray(data.taskNotes) ? data.taskNotes : []).map((note: any) => ({
        id: note.id,
        content: note.content,
        createdAt: iso(note.createdAt),
        author: person(note.createdBy ?? ""),
      }));
    }
    return view;
  });
}

export interface ListTasksFilter {
  /** "me" (default), "all", or a member id. */
  assignee?: string;
  status?: TaskStatus;
  projectId?: string;
  /** Leave out tasks that are done. Defaults to true. */
  openOnly?: boolean;
  limit: number;
}

/**
 * Tasks in the actor's workspace, soonest due first, undated last.
 *
 * Each query uses a single equality so no composite index is needed;
 * the workspace check and the remaining filters run in memory.
 */
export async function listTasks(actor: TaskActor, filter: ListTasksFilter): Promise<TaskView[]> {
  const assignee = !filter.assignee || filter.assignee === "me" ? actor.uid : filter.assignee;

  let query: FirebaseFirestore.Query = adminDb.collection("tasks");
  if (filter.projectId) query = query.where("projectId", "==", filter.projectId);
  else if (assignee !== "all") query = query.where("assignedTo", "array-contains", assignee);
  else query = query.where("orgId", "==", actor.orgId);

  const snap = await query.get();
  const openOnly = filter.openOnly ?? true;

  const docs = snap.docs
    .filter((doc) => {
      const data = doc.data();
      if (data.orgId !== actor.orgId) return false;
      if (assignee !== "all" && !(data.assignedTo ?? []).includes(assignee)) return false;
      if (filter.status && data.status !== filter.status) return false;
      if (!filter.status && openOnly && data.status === "done") return false;
      return true;
    })
    .sort((a, b) => {
      const ak = a.data().dueDateKey ?? "9999-99-99";
      const bk = b.data().dueDateKey ?? "9999-99-99";
      return ak.localeCompare(bk);
    })
    .slice(0, filter.limit);

  return toViews(docs, false);
}

export async function getTask(actor: TaskActor, taskId: string): Promise<CoreResult<{ task: TaskView }>> {
  const loaded = await loadOwnTask(actor, taskId);
  if ("error" in loaded) return { success: false, error: loaded.error! };
  const [task] = await toViews([loaded.snap], true);
  return { success: true, task };
}
