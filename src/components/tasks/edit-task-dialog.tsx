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

interface EditTaskDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  onUpdated: () => void;
}

export function EditTaskDialog({
  task,
  open,
  onOpenChange,
  members,
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
        dueDate: data.dueDate ? Timestamp.fromDate(new Date(data.dueDate)) : null,
      });
      onOpenChange(false);
      onUpdated();
    } catch (err) {
      console.error("Failed to update task:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" id="edit-task-dialog">
        <DialogHeader>
          <DialogTitle>Modify Directive</DialogTitle>
          <DialogDescription>
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

          <DialogFooter className="gap-2 mt-8 border-t border-white/[0.04] pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} id="submit-edit-task">
              {loading ? "Modifying..." : "Save Modifications"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
