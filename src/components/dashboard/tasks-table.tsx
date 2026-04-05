"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Plus, ArrowUpDown, Calendar } from "lucide-react";
import { Task } from "@/types/task";
import { Member } from "@/types/member";
import { TaskStatusSelect } from "@/components/tasks/task-status-select";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { cn } from "@/lib/utils/classnames";

interface TasksTableProps {
  tasks: Task[];
  members: Member[];
  currentUserId: string;
  isOwner: boolean;
  orgId: string;
  projectId: string;
  onTaskUpdated: () => void;
}

const statusLabels: Record<string, { label: string; bg: string; text: string }> = {
  todo: { label: "To Do", bg: "bg-[#111111]", text: "text-[#888888]" },
  doing: { label: "In Progress", bg: "bg-[#1A150A]", text: "text-[#E5B567]" },
  done: { label: "Done", bg: "bg-[#0F1A13]", text: "text-[#85C89B]" },
};

export function TasksTable({
  tasks,
  members,
  currentUserId,
  isOwner,
  orgId,
  projectId,
  onTaskUpdated,
}: TasksTableProps) {
  const [createOpen, setCreateOpen] = useState(false);

  const getMemberName = (memberId: string | null) => {
    if (!memberId) return "Unassigned";
    return members.find((m) => m.id === memberId)?.name ?? "Unknown";
  };

  return (
    <div className="animate-fade-in bg-[#0A0A0A] hover:bg-[#111111] hover:-translate-y-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] rounded-[24px] p-8 sm:p-10 ring-1 ring-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#888888]">
            Master Objective Log
          </h2>
          <p className="text-[13px] text-[#555555] font-medium mt-1">
            {tasks.length} node{tasks.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        {isOwner && (
          <button
            onClick={() => setCreateOpen(true)}
            disabled={!projectId}
            title={!projectId ? "Create a project first" : "Create Task"}
            className="flex items-center justify-center gap-2 bg-[#111111] hover:bg-[#1a1a1a] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.2)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px] border-0 rounded-lg px-4 h-9 text-[12px] font-medium focus:outline-none ring-0 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <Plus className="w-3.5 h-3.5 text-[#888888] group-hover:text-[#ededed] transition-colors" />
            Append Directive
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead>
            <tr className="border-b border-white/[0.04]">
              <th className="pb-4 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#555555] w-[45%] font-mono">
                Directive
              </th>
              <th className="pb-4 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#555555] w-[15%] font-mono">
                State
              </th>
              <th className="pb-4 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#555555] w-[20%] font-mono">
                Operator
              </th>
              <th className="pb-4 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#555555] w-[20%] font-mono">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 opacity-60" />
                  Horizon
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-16 text-center">
                  <p className="text-[14px] font-medium text-[#ededed] mb-1">No directives listed.</p>
                  <p className="text-[13px] text-[#888888] font-light mt-1">
                    {isOwner 
                      ? projectId ? "Append your first directive to begin." : "Initialize a project first."
                      : "Directives assigned to you will appear in this sector."}
                  </p>
                </td>
              </tr>
            ) : (
              tasks.map((task) => {
                const isOverdue =
                  task.dueDate &&
                  task.dueDate.toDate() < new Date() &&
                  task.status !== "done";
                const canEdit = isOwner || task.assignedTo === currentUserId;
                const status = statusLabels[task.status];

                return (
                  <tr
                    key={task.id}
                    className={cn(
                      "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white/[0.04] hover:-translate-y-[1px]",
                      task.status === "done" && "opacity-50 hover:opacity-75"
                    )}
                  >
                    <td className="py-4 pr-4">
                      <p
                        className={cn(
                          "text-[14px] font-medium text-[#ededed]",
                          task.status === "done" && "line-through text-[#666666]"
                        )}
                      >
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-[12px] text-[#888888] font-light mt-1.5 truncate max-w-[280px] lg:max-w-md">
                          {task.description}
                        </p>
                      )}
                    </td>
                    <td className="py-4 pr-4 align-middle">
                      {canEdit ? (
                        <div className="scale-90 origin-left">
                          <TaskStatusSelect
                            taskId={task.id}
                            currentStatus={task.status}
                            onUpdated={onTaskUpdated}
                          />
                        </div>
                      ) : (
                        <span className={cn(
                          "px-2.5 py-1 rounded inline-flex items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] text-[11px] font-semibold tracking-wider uppercase",
                          status.bg,
                          status.text
                        )}>
                          {status.label}
                        </span>
                      )}
                    </td>
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        {task.assignedTo ? (
                          <>
                            <div className="w-6 h-6 rounded bg-[#151515] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0">
                              <span className="text-[10px] font-semibold text-[#ededed]">
                                {getMemberName(task.assignedTo).charAt(0)}
                              </span>
                            </div>
                            <span className="text-[13px] text-[#ededed] font-medium">
                              {getMemberName(task.assignedTo)}
                            </span>
                          </>
                        ) : (
                          <span className="text-[13px] text-[#555555] font-medium">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      {task.dueDate ? (
                        <span
                          className={cn(
                            "text-[12px] uppercase tracking-wider font-medium flex items-center gap-2",
                            isOverdue ? "text-[#E57A7A]" : "text-[#888888]"
                          )}
                        >
                          {isOverdue && <span className="w-1.5 h-1.5 rounded-full bg-[#E57A7A] animate-pulse"></span>}
                          {format(task.dueDate.toDate(), "dd MMM yyyy")}
                        </span>
                      ) : (
                        <span className="text-[13px] text-[#555555] font-medium">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
        projectId={projectId}
        members={members}
        currentUserId={currentUserId}
        onCreated={onTaskUpdated}
      />
    </div>
  );
}
