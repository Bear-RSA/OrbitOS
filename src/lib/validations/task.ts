import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1, "Task title is required").max(100, "Title too long"),
  description: z.string().max(500, "Description too long").optional().default(""),
  assignedTo: z.array(z.string()).max(2, "Maximum 2 operatives allowed").default([]),
  milestone: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export const updateTaskStatusSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(["todo", "doing", "done"]),
});

export const updateTaskSchema = z.object({
  status: z.enum(["todo", "doing", "done"]).optional(),
  assignedTo: z.array(z.string()).max(2, "Maximum 2 operatives allowed").optional(),
  milestone: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
