"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTaskSchema, CreateTaskInput } from "@/lib/validations/task";
import { updateTaskAction } from "@/app/actions/tasks";
import { Member } from "@/types/member";
import { Task } from "@/types/task";
import { dueDateKeyOf } from "@/lib/utils/dates";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { X, ChevronDown } from "lucide-react";

import { recordTelemetryAction } from "@/app/actions/telemetry";

interface EditTaskDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  orgId: string;
  projectId: string;
  currentUserId: string;
  onUpdated: () => void;
}

export function EditTaskDialog({
  task,
  open,
  onOpenChange,
  members,
  orgId,
  projectId,
  currentUserId,
  onUpdated,
}: EditTaskDialogProps) {
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      title: "",
      description: "",
      assignedTo: [],
      milestone: null,
      dueDate: null,
    },
  });

  const selectedAssignees = watch("assignedTo") || [];

  useEffect(() => {
    if (task && open) {
      // Pre-fill the form when modal opens
      reset({
         title: task.title,
         description: task.description || "",
         assignedTo: task.assignedTo,
         milestone: task.milestone || null,
         // The date input speaks the same "YYYY-MM-DD" the key stores.
         dueDate: dueDateKeyOf(task),
      });
    }
  }, [task, open, reset]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleAssignee = (memberId: string) => {
    const current = selectedAssignees;
    if (current.includes(memberId)) {
      setValue("assignedTo", current.filter(id => id !== memberId));
    } else if (current.length < 2) {
      setValue("assignedTo", [...current, memberId]);
    }
  };

  const removeAssignee = (memberId: string) => {
    setValue("assignedTo", selectedAssignees.filter(id => id !== memberId));
  };

  const onSubmit = async (data: CreateTaskInput) => {
    if (!task) return;
    setLoading(true);
    try {
      const result = await updateTaskAction({
        taskId: task.id,
        uid: currentUserId,
        updates: {
          title: data.title,
          description: data.description ?? "",
          assignedTo: data.assignedTo,
          milestone: data.milestone || "Unassigned",
          dueDate: data.dueDate || null,
        },
      });
      if (!result.success) throw new Error(result.error);

      // Update UI immediately
      onOpenChange(false);
      onUpdated();

      // Background telemetry and sync.
      // DIRECTIVE_EDITED and DIRECTIVE_ASSIGNED are logged by
      // updateTaskAction itself — see the note atop actions/tasks.ts.
      const actorName = members.find((m) => m.id === currentUserId)?.name || "System";

      // Emit WORKLOAD_SHIFT when assignees have changed
      const previousAssignees = task.assignedTo;
      const newAssignees = data.assignedTo;
      const assigneesChanged = 
        previousAssignees.length !== newAssignees.length ||
        previousAssignees.some(uid => !newAssignees.includes(uid));

      if (assigneesChanged) {
        recordTelemetryAction({
          eventType: "WORKLOAD_SHIFT",
          orgId,
          projectId,
          actor: { uid: currentUserId, name: actorName },
          metadata: { taskTitle: data.title, previousAssignees, newAssignees },
        }).catch(err => console.error("[Telemetry Error]:", err));
      }

      // Sync operational status for all involved members
      const allInvolvedUids = new Set([...previousAssignees, ...newAssignees]);
      if (allInvolvedUids.size > 0) {
        import("@/app/actions/personnel").then(({ syncOperationalStatusAction }) => {
          allInvolvedUids.forEach(uid => {
            syncOperationalStatusAction(uid, orgId).catch(err => console.error("[Sync Error]:", err));
          });
        });
      }
    } catch (err) {
      console.error("Failed to update task:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-10 bg-surface-sunken/95 border-line/[0.04]">
        <DialogHeader className="text-left sm:text-left space-y-4">
          <DialogTitle className="text-xl font-medium tracking-tight text-ink">
            Modify Directive
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-ink-dim font-light max-w-[360px]">
            Update operating parameters for this vector.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-2">
          <div className="space-y-2.5">
            <Label htmlFor="edit-task-title">Directive Title</Label>
            <Input
              id="edit-task-title"
              placeholder="What needs to be done?"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-[12px] text-orbit-red">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="edit-task-description">Additional Context</Label>
            <Textarea
              id="edit-task-description"
              placeholder="Provide execution details..."
              rows={3}
              {...register("description")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2.5">
              <Label>Operators <span className="text-[9px] text-ink-dim ml-1 font-mono">(MAX 2)</span></Label>
              <div ref={dropdownRef} className="relative">
                {/* Selected chips + trigger */}
                <button
                  type="button"
                  id="edit-task-assignee"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full min-h-[36px] flex items-center gap-1.5 flex-wrap bg-surface-sunken border border-line/[0.1] rounded-md px-3 py-1.5 text-left focus:outline-none focus:border-line/[0.2] transition-colors"
                >
                  {selectedAssignees.length === 0 ? (
                    <span className="text-[13px] text-ink-dim">Unassigned</span>
                  ) : (
                    selectedAssignees.map(uid => {
                      const member = members.find(m => m.id === uid);
                      return (
                        <span
                          key={uid}
                          className="inline-flex items-center gap-1 bg-surface-control border border-line/[0.08] rounded px-2 py-0.5 text-[11px] text-ink font-mono uppercase tracking-wider"
                        >
                          {member?.name?.split(" ")[0] || "?"}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeAssignee(uid); }}
                            className="hover:text-orbit-red transition-colors ml-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })
                  )}
                  <ChevronDown className="w-3.5 h-3.5 text-ink-dim ml-auto shrink-0" />
                </button>

                {/* Dropdown */}
                {dropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-surface-sunken border border-line/[0.1] rounded-md shadow-raised overflow-hidden">
                    {members.map(member => {
                      const isSelected = selectedAssignees.includes(member.id);
                      const isDisabled = !isSelected && selectedAssignees.length >= 2;
                      return (
                        <button
                          key={member.id}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => toggleAssignee(member.id)}
                          className={`w-full text-left px-3 py-2 text-[12px] font-mono transition-colors ${
                            isSelected
                              ? "bg-surface-control text-ink"
                              : isDisabled
                                ? "text-ink-faint cursor-not-allowed"
                                : "text-ink-muted hover:bg-surface-raised hover:text-ink"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {isSelected && <span className="text-orbit-green text-[10px]">●</span>}
                            {member.name}
                            {isDisabled && <span className="text-[9px] text-ink-faint ml-auto uppercase tracking-widest">[MAX]</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {errors.assignedTo && (
                <p className="text-[12px] text-orbit-red">{errors.assignedTo.message}</p>
              )}
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="edit-task-due-date">Completion Horizon</Label>
              <Input
                id="edit-task-due-date"
                type="date"
                {...register("dueDate")}
                /* See create-task-dialog: the glyph is already light under
                   `color-scheme: dark`, so it must not be inverted. */
                className="[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:transition-opacity hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
              />
            </div>
          </div>


          <DialogFooter className="flex-row justify-start sm:justify-start gap-4 mt-10">
            <Button 
              type="submit" 
              disabled={loading} 
              id="submit-edit-task"
              className="h-9 px-5 rounded-lg text-[12px] min-w-[120px]"
            >
              {loading ? "Modifying..." : "Save Modifications"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-9 px-5 rounded-lg text-[12px] text-ink-faint hover:text-ink-muted hover:bg-transparent"
            >
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
