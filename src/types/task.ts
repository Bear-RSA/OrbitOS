import { Timestamp } from "firebase/firestore";

export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
  id: string;
  orgId: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedTo: string | null;
  createdBy: string;
  dueDate: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastUpdatedAt: Timestamp;
  completedAt: Timestamp | null;
  isBlocked: boolean;
  blockedReason?: string;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  assignedTo: string | null;
  dueDate: string | null;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  assignedTo?: string | null;
  dueDate?: string | null;
}
