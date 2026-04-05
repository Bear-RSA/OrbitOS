"use client";

import { useState } from "react";
import { TaskStatus } from "@/types/task";
import { updateTaskStatus } from "@/lib/queries/tasks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils/classnames";

interface TaskStatusSelectProps {
  taskId: string;
  currentStatus: TaskStatus;
  onUpdated: () => void;
}

const statusConfig = {
  todo: { label: "To Do", className: "text-[#888888]", bg: "bg-[#111111]" },
  doing: { label: "In Progress", className: "text-[#E5B567]", bg: "bg-[#1A150A]" },
  done: { label: "Done", className: "text-[#85C89B]", bg: "bg-[#0F1A13]" },
};

export function TaskStatusSelect({ taskId, currentStatus, onUpdated }: TaskStatusSelectProps) {
  const [status, setStatus] = useState<TaskStatus>(currentStatus);
  const [loading, setLoading] = useState(false);

  const handleChange = async (value: string) => {
    const newStatus = value as TaskStatus;
    const prevStatus = status;
    setStatus(newStatus);
    setLoading(true);
    try {
      await updateTaskStatus(taskId, newStatus, prevStatus);
      onUpdated();
    } catch (err) {
      console.error("Failed to update status:", err);
      setStatus(prevStatus);
    } finally {
      setLoading(false);
    }
  };

  const config = statusConfig[status];

  return (
    <Select value={status} onValueChange={handleChange} disabled={loading}>
      <SelectTrigger
        className={cn(
          "h-[26px] text-[11px] font-semibold tracking-wider uppercase border-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] px-2.5 w-auto gap-2 focus:ring-1 focus:ring-white/[0.1] rounded py-0 transition-colors",
          config.bg,
          config.className
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todo">To Do</SelectItem>
        <SelectItem value="doing">In Progress</SelectItem>
        <SelectItem value="done">Done</SelectItem>
      </SelectContent>
    </Select>
  );
}
