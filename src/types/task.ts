import { Timestamp } from "firebase/firestore";

export type TaskStatus = "todo" | "doing" | "done";

export interface TaskNote {
  id: string;
  content: string;
  createdAt: Timestamp;
  createdBy: string;
}

export interface Task {
  id: string;
  orgId: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedTo: string[];
  milestone?: string | null;
  createdBy: string;
  /**
   * Sort/range key only. The calendar day this represents is `dueDateKey`
   * — deriving a day from this Timestamp shifts it by timezone.
   */
  dueDate: Timestamp | null;
  /** "YYYY-MM-DD". The authority on which day the task is due. */
  dueDateKey?: string | null;
  /**
   * The `dueDateKey` a due-soon reminder has already gone out for. Written
   * by the reminder cron and by nothing else, so moving a due date to a new
   * day makes the value stale and earns a fresh reminder.
   */
  dueReminderSentFor?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastUpdatedAt: Timestamp;
  completedAt: Timestamp | null;
  isBlocked: boolean;
  blockedReason?: string;
  taskNotes?: TaskNote[];
}

export interface CreateTaskInput {
  title: string;
  description: string;
  assignedTo: string[];
  milestone?: string | null;
  dueDate: string | null;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  assignedTo?: string[];
  milestone?: string | null;
  dueDate?: string | null;
}
