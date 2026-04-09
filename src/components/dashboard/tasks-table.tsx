"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Plus, Pencil } from "lucide-react";
import { Task } from "@/types/task";
import { Member } from "@/types/member";
import { TaskStatusSelect } from "@/components/tasks/task-status-select";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { EditTaskDialog } from "@/components/tasks/edit-task-dialog";
import { toggleTaskBlocked } from "@/lib/queries/tasks";
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
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const getMemberName = (memberId: string | null) => {
    return members.find((m) => m.id === memberId)?.name ?? "Unknown";
  };

  const handleToggleBlocked = async (taskId: string, currentBlocked: boolean) => {
    try {
      await toggleTaskBlocked(taskId, !currentBlocked);
      onTaskUpdated();
    } catch (err) {
      console.error("Failed to toggle blocked state:", err);
    }
  };

  return (
    <div className="animate-fade-in py-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-10 gap-8">
        <div>
          <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#444444] mb-3">
            Operational Log
          </h2>
          <div className="flex items-center gap-4">
            <h3 className="text-2xl font-light text-[#ededed] tracking-tight">Master Objective List</h3>
            <span className="h-4 w-px bg-white/[0.06]" />
            <span className="text-[12px] text-[#555555] font-mono tabular-nums">
              {tasks.length} Nodes Registered
            </span>
          </div>
        </div>
        {isOwner && (
          <button
            onClick={() => setCreateOpen(true)}
            disabled={!projectId}
            title={!projectId ? "Create a project first" : "Create Task"}
            className="flex items-center justify-center gap-2.5 bg-[#111111] hover:bg-[#161616] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.3)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_16px_rgba(0,0,0,0.4)] border-0 rounded-lg px-5 h-9 text-[12px] font-medium focus:outline-none ring-0 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <Plus className="w-3.5 h-3.5 text-[#666666] group-hover:text-[#aaa] transition-colors duration-300" />
            Append Directive
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="border-b border-white/[0.05]">
              <th className="pb-5 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[#3a3a3a] w-[45%]">
                Directive
              </th>
              <th className="pb-5 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[#3a3a3a] w-[15%]">
                Status
              </th>
              <th className="pb-5 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[#3a3a3a] w-[20%]">
                Personnel
              </th>
              <th className="pb-5 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[#3a3a3a] w-[20%] text-right">
                Horizon
              </th>
            </tr>
          </thead>
          <tbody>
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
              tasks.map((task, index) => {
                let horizonText = "—";
                let horizonSubText = "";
                let horizonColor = "text-[#555555] group-hover/row:text-[#777]";

                if (task.dueDate) {
                   const dueDate = task.dueDate.toDate();
                   const today = new Date();
                   today.setHours(0, 0, 0, 0);
                   const due = new Date(dueDate);
                   due.setHours(0, 0, 0, 0);
                   const daysDiff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                   if (task.status === "done") {
                      horizonText = format(dueDate, "dd MMM yyyy");
                   } else if (daysDiff < 0) {
                      horizonText = `Overdue by ${Math.abs(daysDiff)}d`;
                      horizonColor = "text-orbit-red font-semibold";
                      horizonSubText = format(dueDate, "dd MMM yyyy");
                   } else if (daysDiff === 0) {
                      horizonText = "Due Today";
                      horizonColor = "text-orbit-amber font-medium";
                      horizonSubText = format(dueDate, "dd MMM");
                   } else if (daysDiff === 1) {
                      horizonText = "Due Tomorrow";
                      horizonColor = "text-[#ededed] font-medium";
                      horizonSubText = format(dueDate, "dd MMM");
                   } else {
                      horizonText = `Due ${format(dueDate, "dd MMM")}`;
                      horizonSubText = format(dueDate, "yyyy");
                   }
                }

                const canEdit = isOwner || task.assignedTo === currentUserId;
                const isDone = task.status === "done";

                return (
                  <tr
                    key={task.id}
                    className={cn(
                      "row-enter group/row transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-default border-b border-white/[0.02] last:border-b-0",
                      isDone && "opacity-40",
                      task.isBlocked && !isDone && "bg-[#0d0808]/40",
                      !task.isBlocked && !isDone && "hover:bg-white/[0.02]"
                    )}
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    {/* Directive Cell */}
                    <td className="py-5 pr-6">
                      <div className="flex items-start gap-3">
                        {/* Blocked side indicator */}
                        {task.isBlocked && !isDone && (
                          <div className="w-[3px] self-stretch rounded-full bg-orbit-red/40 flex-shrink-0 mt-0.5 urgency-breath" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              "text-[14px] font-medium tracking-tight leading-snug",
                              isDone ? "text-[#555555] line-through decoration-white/10" : "text-[#e0e0e0] group-hover/row:text-white transition-colors duration-300"
                            )}
                          >
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="text-[12px] text-[#555555] group-hover/row:text-[#666666] font-light mt-1.5 truncate max-w-[340px] lg:max-w-md transition-colors duration-300 leading-relaxed">
                              {task.description}
                            </p>
                          )}
                          {task.isBlocked && !isDone && (
                            <div className="mt-3 flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded text-[9px] font-mono uppercase tracking-wider bg-orbit-red/[0.08] text-orbit-red/80 ring-1 ring-orbit-red/[0.12]">
                                <span className="w-1 h-1 rounded-full bg-orbit-red/70 urgency-breath" />
                                Blocked
                              </span>
                              {task.blockedReason && (
                                <span className="text-[10px] text-[#555555] font-light truncate max-w-[200px]">
                                  {task.blockedReason}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Status Cell */}
                    <td className="py-5 pr-4 align-top">
                      <div className="flex flex-col gap-2">
                        {canEdit ? (
                          <TaskStatusSelect
                            taskId={task.id}
                            currentStatus={task.status}
                            onUpdated={onTaskUpdated}
                          />
                        ) : (
                          <span className={cn(
                            "px-2.5 py-1 rounded text-[10px] font-semibold tracking-wider uppercase inline-flex items-center w-fit",
                            task.status === "todo" && "bg-white/[0.04] text-[#888888]",
                            task.status === "doing" && "bg-orbit-amber/10 text-orbit-amber",
                            task.status === "done" && "bg-orbit-green/10 text-orbit-green"
                          )}>
                            {task.status === "todo" ? "Todo" : task.status === "doing" ? "In Progress" : "Done"}
                          </span>
                        )}
                        
                        {canEdit && task.status !== "done" && (
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => handleToggleBlocked(task.id, task.isBlocked)}
                              className={cn(
                                "flex items-center justify-center px-2 py-1.5 rounded-md text-[11px] font-medium transition-all duration-300",
                                task.isBlocked 
                                  ? "bg-orbit-red/[0.08] text-orbit-red ring-1 ring-orbit-red/[0.15] hover:bg-orbit-red/[0.12]" 
                                  : "bg-white/[0.03] text-[#888888] ring-1 ring-white/[0.05] hover:bg-white/[0.06] hover:text-[#ededed]"
                              )}
                            >
                              {task.isBlocked ? "Resolve" : "Block"}
                            </button>
                            <button
                              onClick={() => setEditingTask(task)}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.03] hover:bg-white/[0.06] text-[#888888] hover:text-[#ededed] text-[11px] font-medium transition-all duration-300 ring-1 ring-white/[0.05]"
                            >
                              <Pencil className="w-3 h-3" />
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Personnel Cell */}
                    <td className="py-5 pr-4 align-top">
                      <div className="flex items-center gap-3">
                        {task.assignedTo ? (
                          <>
                            <div className="w-6 h-6 rounded-md bg-[#131313] ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0 group-hover/row:ring-white/[0.1] transition-all duration-300">
                              <span className="text-[10px] font-semibold text-[#ccc]">
                                {getMemberName(task.assignedTo).charAt(0)}
                              </span>
                            </div>
                            <span className="text-[13px] text-[#bbb] group-hover/row:text-[#ededed] font-medium transition-colors duration-300">
                              {getMemberName(task.assignedTo)}
                            </span>
                          </>
                        ) : (
                          <span className="text-[13px] text-[#333333] font-medium">—</span>
                        )}
                      </div>
                    </td>

                    {/* Horizon Cell */}
                    <td className="py-5 pl-4 text-right align-top">
                      {task.dueDate ? (
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={cn(
                              "text-[11px] font-mono uppercase tracking-widest tabular-nums transition-colors duration-300",
                              horizonColor
                            )}
                          >
                            {horizonText}
                          </span>
                          {horizonSubText && (
                            <span className="text-[8px] font-mono uppercase tracking-[0.2em] text-[#555555]">
                              {horizonSubText}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#222222] font-mono">—</span>
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

      <EditTaskDialog
        task={editingTask}
        open={!!editingTask}
        onOpenChange={(isOpen) => !isOpen && setEditingTask(null)}
        members={members}
        onUpdated={() => {
          setEditingTask(null);
          onTaskUpdated();
        }}
      />
    </div>
  );
}
