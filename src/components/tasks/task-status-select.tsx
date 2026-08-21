"use client";

import { useState } from "react";
import { TaskStatus } from "@/types/task";
import { updateTaskStatusAction } from "@/app/actions/tasks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils/classnames";

import { recordTelemetryAction } from "@/app/actions/telemetry";

interface TaskStatusSelectProps {
  taskId: string;
  taskTitle: string;
  currentStatus: TaskStatus;
  orgId: string;
  projectId: string;
  currentUserId: string;
  memberName: string;
  milestoneName: string;
  isCompletingMilestone: boolean;
  onUpdated: () => void;
}

const statusConfig = {
  todo: { label: "To Do", className: "text-ink-muted", bg: "bg-surface-sunken", ring: "ring-line/[0.04]" },
  doing: { label: "In Progress", className: "text-orbit-amber", bg: "bg-orbit-amber/[0.08]", ring: "ring-orbit-amber/[0.08]" },
  done: { label: "Done", className: "text-orbit-green", bg: "bg-orbit-green/[0.08]", ring: "ring-orbit-green/[0.08]" },
};

export function TaskStatusSelect({ 
  taskId, 
  taskTitle,
  currentStatus, 
  orgId,
  projectId,
  currentUserId,
  memberName,
  milestoneName,
  isCompletingMilestone,
  onUpdated 
}: TaskStatusSelectProps) {
  const [status, setStatus] = useState<TaskStatus>(currentStatus);
  const [loading, setLoading] = useState(false);

  const handleChange = async (value: string) => {
    const newStatus = value as TaskStatus;
    const prevStatus = status;
    setStatus(newStatus);
    setLoading(true);
    try {
      const result = await updateTaskStatusAction({
        taskId,
        status: newStatus,
        previousStatus: prevStatus,
        uid: currentUserId,
      });
      if (!result.success) throw new Error(result.error);
      
      // Update UI immediately — don't block on telemetry
      onUpdated();

      // DIRECTIVE_TRANSITION is logged by updateTaskStatusAction itself —
      // see the note atop actions/tasks.ts. Milestones are not, so that one
      // stays here as background telemetry (fire-and-forget).
      if (newStatus === "done" && isCompletingMilestone) {
        recordTelemetryAction({
          eventType: "MILESTONE_COMPLETE",
          orgId,
          projectId,
          actor: { uid: currentUserId, name: memberName },
          metadata: { milestone: milestoneName }
        }).catch(err => console.error("[Telemetry Error]:", err));
      }
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
          "h-[28px] text-[10px] font-semibold tracking-wider uppercase border-0 shadow-card px-3 w-auto gap-2 focus:ring-1 focus:ring-line/[0.1] rounded-md py-0 transition-all duration-300 ring-1",
          config.bg,
          config.className,
          config.ring,
          loading && "opacity-50"
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
