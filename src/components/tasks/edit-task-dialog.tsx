"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTaskSchema, CreateTaskInput } from "@/lib/validations/task";
import { updateTaskAction } from "@/app/actions/tasks";
import { Member } from "@/types/member";
import { Task } from "@/types/task";
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
         assignedTo: Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo as unknown as string] : []),
         milestone: task.milestone || null,
         dueDate: task.dueDate ? task.dueDate.toDate().toISOString().split("T")[0] : null,
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

      // Background telemetry and sync
      const actorName = members.find((m) => m.id === currentUserId)?.name || "System";
      recordTelemetryAction({
        eventType: "DIRECTIVE_TRANSITION",
        orgId,
        projectId,
        actor: { uid: currentUserId, name: actorName },
        metadata: { taskTitle: data.title, from: "Edited", to: "Updated" },
      }).catch(err => console.error("[Telemetry Error]:", err));

      // Emit WORKLOAD_SHIFT when assignees have changed
      const previousAssignees = Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo as unknown as string] : []);
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
      <DialogContent className="sm:max-w-[480px] p-10 bg-[#080808]/95 border-white/[0.04]">
        <DialogHeader className="text-left sm:text-left space-y-4">
          <DialogTitle className="text-xl font-medium tracking-tight text-[#ededed]">
            Modify Directive
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-[#666666] font-light max-w-[360px]">
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
              <p className="text-[12px] text-[#E57A7A]">{errors.title.message}</p>
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
              <Label>Operators <span className="text-[9px] text-[#555] ml-1 font-mono">(MAX 2)</span></Label>
              <div ref={dropdownRef} className="relative">
                {/* Selected chips + trigger */}
                <button
                  type="button"
                  id="edit-task-assignee"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full min-h-[36px] flex items-center gap-1.5 flex-wrap bg-[#0A0A0A] border border-[#1a1a1a] rounded-md px-3 py-1.5 text-left focus:outline-none focus:border-[#333] transition-colors"
                >
                  {selectedAssignees.length === 0 ? (
                    <span className="text-[13px] text-[#555]">Unassigned</span>
                  ) : (
                    selectedAssignees.map(uid => {
                      const member = members.find(m => m.id === uid);
                      return (
                        <span
                          key={uid}
                          className="inline-flex items-center gap-1 bg-white/[0.06] border border-white/[0.08] rounded px-2 py-0.5 text-[11px] text-[#ededed] font-mono uppercase tracking-wider"
                        >
                          {member?.name?.split(" ")[0] || "?"}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeAssignee(uid); }}
                            className="hover:text-[#E57A7A] transition-colors ml-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })
                  )}
                  <ChevronDown className="w-3.5 h-3.5 text-[#555] ml-auto shrink-0" />
                </button>

                {/* Dropdown */}
                {dropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-[#0A0A0A] border border-[#1a1a1a] rounded-md shadow-[0_8px_32px_rgba(0,0,0,0.8)] overflow-hidden">
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
                              ? "bg-white/[0.06] text-[#ededed]"
                              : isDisabled
                                ? "text-[#333] cursor-not-allowed"
                                : "text-[#888] hover:bg-white/[0.04] hover:text-[#ededed]"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {isSelected && <span className="text-[#85C89B] text-[10px]">●</span>}
                            {member.name}
                            {isDisabled && <span className="text-[9px] text-[#444] ml-auto uppercase tracking-widest">[MAX]</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {errors.assignedTo && (
                <p className="text-[12px] text-[#E57A7A]">{errors.assignedTo.message}</p>
              )}
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="edit-task-due-date">Completion Horizon</Label>
              <Input
                id="edit-task-due-date"
                type="date"
                {...register("dueDate")}
                className="[&::-webkit-calendar-picker-indicator]:invert-[0.8]"
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
              className="h-9 px-5 rounded-lg text-[12px] text-[#444444] hover:text-[#888888] hover:bg-transparent"
            >
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
