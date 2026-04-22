"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTaskSchema, CreateTaskInput } from "@/lib/validations/task";
import { updateTask } from "@/lib/queries/tasks";
import { Member } from "@/types/member";
import { Task } from "@/types/task";
import { Timestamp } from "firebase/firestore";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      title: "",
      description: "",
      assignedTo: null,
      milestone: null,
      dueDate: null,
    },
  });

  useEffect(() => {
    if (task && open) {
      // Pre-fill the form when modal opens
      reset({
         title: task.title,
         description: task.description || "",
         assignedTo: task.assignedTo || null,
         milestone: task.milestone || null,
         dueDate: task.dueDate ? task.dueDate.toDate().toISOString().split("T")[0] : null,
      });
    }
  }, [task, open, reset]);

  const onSubmit = async (data: CreateTaskInput) => {
    if (!task) return;
    setLoading(true);
    try {
      await updateTask(task.id, {
        title: data.title,
        description: data.description ?? "",
        assignedTo: data.assignedTo ?? null,
        milestone: data.milestone || "Unassigned",
        dueDate: data.dueDate ? Timestamp.fromDate(new Date(data.dueDate)) : null,
      });

      const actorName = members.find((m) => m.id === currentUserId)?.name || "System";
      await recordTelemetryAction({
        eventType: "DIRECTIVE_TRANSITION",
        orgId,
        projectId,
        actor: { uid: currentUserId, name: actorName },
        metadata: { taskTitle: data.title, from: "Edited", to: "Updated" },
      });

      onOpenChange(false);
      onUpdated();

      // Auto-sync operative status based on new workload
      if (data.assignedTo || task.assignedTo) {
        const { syncOperationalStatusAction } = await import("@/app/actions/personnel");
        if (data.assignedTo) syncOperationalStatusAction(data.assignedTo, orgId);
        if (task.assignedTo && task.assignedTo !== data.assignedTo) syncOperationalStatusAction(task.assignedTo, orgId);
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
              <Label>Operator</Label>
              <Select
                defaultValue={task.assignedTo || "unassigned"}
                onValueChange={(val) =>
                  setValue("assignedTo", val === "unassigned" ? null : val)
                }
              >
                <SelectTrigger id="edit-task-assignee">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
