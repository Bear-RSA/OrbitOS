import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  Timestamp,
  orderBy,
  onSnapshot,
  arrayUnion,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Task, TaskStatus } from "@/types/task";

const TASKS_COLLECTION = "tasks";

export function subscribeToTasksByProject(
  projectId: string,
  orgId: string,
  callback: (tasks: Task[]) => void
) {
  console.log(`[Telemetry] Initiating directive scan for Project: ${projectId} (Org: ${orgId})`);
  const q = query(
    collection(db, TASKS_COLLECTION),
    where("projectId", "==", projectId),
    where("orgId", "==", orgId)
  );

  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Task[];
    
    console.log(`[Telemetry] Scan complete. Found ${tasks.length} reactive directives for segment: ${projectId}`);

    // Two-Tier Operational Sorting Strategy
    tasks.sort((a, b) => {
      const aIsDone = a.status === "done";
      const bIsDone = b.status === "done";

      // 1. Primary: State (Idle/Active first, Executed last)
      if (aIsDone !== bIsDone) {
        return aIsDone ? 1 : -1;
      }

      // Helper to get consistent temporal marker
      const getHorizonMs = (t: any) => {
        const d = t.dueDate || t.horizon;
        if (!d) return null;
        if (typeof d.toMillis === 'function') return d.toMillis();
        if (typeof d.toDate === 'function') return d.toDate().getTime();
        return new Date(d).getTime();
      };

      const getRecencyMs = (t: any) => {
        const d = t.updatedAt || t.completedAt || t.createdAt;
        if (!d) return 0;
        if (typeof d.toMillis === 'function') return d.toMillis();
        if (typeof d.toDate === 'function') return d.toDate().getTime();
        return new Date(d).getTime();
      };

      if (!aIsDone) {
        // 2. Secondary: Urgency for Active/Idle (Horizon ASC)
        const aTime = getHorizonMs(a);
        const bTime = getHorizonMs(b);
        
        if (aTime === null && bTime === null) return getRecencyMs(b) - getRecencyMs(a);
        if (aTime === null) return 1;
        if (bTime === null) return -1;
        
        return aTime - bTime;
      } else {
        // 3. Tertiary: Recency for Executed (Updated DESC)
        return getRecencyMs(b) - getRecencyMs(a);
      }
    });

    callback(tasks);
  }, (err) => {
    console.error("[Tasks Subscription Error]:", err);
    callback([]);
  });
}

export async function getTasksByOrg(orgId: string): Promise<Task[]> {
  const q = query(
    collection(db, TASKS_COLLECTION),
    where("orgId", "==", orgId)
  );
  const snapshot = await getDocs(q);
  const tasks = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Task));
  
  return tasks.sort((a, b) => {
    const aIsDone = a.status === "done";
    const bIsDone = b.status === "done";
    
    if (aIsDone !== bIsDone) return aIsDone ? 1 : -1;

    const getHMs = (t: any) => {
      const d = t.dueDate || t.horizon;
      if (!d) return null;
      if (typeof d.toMillis === 'function') return d.toMillis();
      if (typeof d.toDate === 'function') return d.toDate().getTime();
      return new Date(d).getTime();
    };

    const getRMs = (t: any) => {
      const d = t.updatedAt || t.completedAt || t.createdAt;
      if (!d) return 0;
      if (typeof d.toMillis === 'function') return d.toMillis();
      if (typeof d.toDate === 'function') return d.toDate().getTime();
      return new Date(d).getTime();
    };

    if (!aIsDone) {
      const aT = getHMs(a);
      const bT = getHMs(b);
      if (aT === null && bT === null) return getRMs(b) - getRMs(a);
      if (aT === null) return 1;
      if (bT === null) return -1;
      return aT - bT;
    } else {
      return getRMs(b) - getRMs(a);
    }
  });
}

export async function createTask(
  data: Omit<Task, "id" | "createdAt" | "updatedAt" | "lastUpdatedAt" | "completedAt">
): Promise<Task> {
  const { auth } = await import("@/lib/firebase/client");
  const currentUser = auth.currentUser;
  
  if (!currentUser) {
    throw new Error("[Security] Authentication missing. Write aborted.");
  }

  // Source of Truth: Derive orgId from the actual user document
  const userSnap = await getDoc(doc(db, "users", currentUser.uid));
  if (!userSnap.exists()) {
    throw new Error("[Security] User document not found. Org context undefined.");
  }
  const actualOrgId = userSnap.data().orgId;

  // Validation: Ensure the target project segment exists
  const projectSnap = await getDoc(doc(db, "projects", data.projectId));
  if (!projectSnap.exists()) {
    throw new Error(`[Validation] Target project ${data.projectId} is not registered in the system.`);
  }

  console.log("[Telemetry] Dispatching hardened directive vector:", { 
    title: data.title, 
    project: data.projectId,
    org: actualOrgId 
  });

  const now = Timestamp.now();
  const taskData = {
    title: data.title,
    description: data.description || "",
    projectId: data.projectId,
    orgId: actualOrgId,
    assignedTo: data.assignedTo || null,
    milestone: data.milestone || "Unassigned",
    createdBy: currentUser.uid,
    dueDate: data.dueDate || null,
    status: data.status || "todo",
    isBlocked: false,
    taskNotes: [],
    createdAt: now,
    updatedAt: now,
    lastUpdatedAt: now,
    completedAt: null,
  };

  // Clean payload: Remove any potentially undefined fields
  const cleanData = JSON.parse(JSON.stringify(taskData, (k, v) => v === undefined ? null : v));

  const ref = await addDoc(collection(db, TASKS_COLLECTION), cleanData);
  console.log("[Telemetry] Vector stabilized. Document ID:", ref.id);
  
  return { id: ref.id, ...taskData } as Task;
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  currentStatus: TaskStatus
): Promise<void> {
  const now = Timestamp.now();
  const updates: Partial<Task> = {
    status,
    updatedAt: now,
    lastUpdatedAt: now,
  };
  if (status === "done" && currentStatus !== "done") {
    updates.completedAt = now;
  }
  if (status !== "done" && currentStatus === "done") {
    updates.completedAt = null;
  }
  await updateDoc(doc(db, TASKS_COLLECTION, taskId), updates as Record<string, unknown>);
}

export async function updateTask(
  taskId: string,
  updates: Partial<Task>
): Promise<void> {
  const now = Timestamp.now();
  await updateDoc(doc(db, TASKS_COLLECTION, taskId), {
    ...updates,
    updatedAt: now,
    lastUpdatedAt: now,
  } as Record<string, unknown>);
}

export async function toggleTaskBlocked(
  taskId: string,
  isBlocked: boolean,
  blockedReason?: string
): Promise<void> {
  const now = Timestamp.now();
  await updateDoc(doc(db, TASKS_COLLECTION, taskId), {
    isBlocked,
    blockedReason: isBlocked ? blockedReason : "",
    updatedAt: now,
    lastUpdatedAt: now,
  });
}

export async function addTaskNote(
  taskId: string,
  content: string,
  createdBy: string
): Promise<void> {
  const now = Timestamp.now();
  const noteId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
  await updateDoc(doc(db, TASKS_COLLECTION, taskId), {
    taskNotes: arrayUnion({
      id: noteId,
      content,
      createdAt: now,
      createdBy,
    }),
    updatedAt: now,
    lastUpdatedAt: now,
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  await deleteDoc(doc(db, TASKS_COLLECTION, taskId));
}

