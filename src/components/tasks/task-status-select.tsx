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
  todo: { label: "To Do", className: "text-[#777777]", bg: "bg-[#0e0e0e]", ring: "ring-white/[0.04]" },
  doing: { label: "In Progress", className: "text-[#E5B567]", bg: "bg-[#14120a]", ring: "ring-[#E5B567]/[0.08]" },
  done: { label: "Done", className: "text-[#85C89B]", bg: "bg-[#0c1410]", ring: "ring-[#85C89B]/[0.08]" },
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
      await updateTaskStatus(taskId, newStatus, prevStatus);
      
      const transitionLogged = recordTelemetryAction({
        eventType: "DIRECTIVE_TRANSITION",
        orgId,
        projectId,
        actor: { uid: currentUserId, name: memberName },
        metadata: { taskTitle, from: prevStatus, to: newStatus }
      });

      const promises = [transitionLogged];

      if (newStatus === "done" && isCompletingMilestone) {
        promises.push(
          recordTelemetryAction({
            eventType: "MILESTONE_COMPLETE",
            orgId,
            projectId,
            actor: { uid: currentUserId, name: memberName },
            metadata: { milestone: milestoneName }
          })
        );
      }

      await Promise.all(promises);
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
          "h-[28px] text-[10px] font-semibold tracking-wider uppercase border-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] px-3 w-auto gap-2 focus:ring-1 focus:ring-white/[0.1] rounded-md py-0 transition-all duration-300 ring-1",
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
