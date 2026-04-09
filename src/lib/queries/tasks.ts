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
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Task, TaskStatus } from "@/types/task";

const TASKS_COLLECTION = "tasks";

export async function getTasksByOrg(orgId: string): Promise<Task[]> {
  const q = query(
    collection(db, TASKS_COLLECTION),
    where("orgId", "==", orgId),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Task));
}

export async function createTask(
  data: Omit<Task, "id" | "createdAt" | "updatedAt" | "lastUpdatedAt" | "completedAt">
): Promise<Task> {
  const now = Timestamp.now();
  const taskData = {
    ...data,
    createdAt: now,
    updatedAt: now,
    lastUpdatedAt: now,
    completedAt: null,
    isBlocked: false,
  };
  const ref = await addDoc(collection(db, TASKS_COLLECTION), taskData);
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
