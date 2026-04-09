"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTaskSchema, CreateTaskInput } from "@/lib/validations/task";
import { createTask } from "@/lib/queries/tasks";
import { Member } from "@/types/member";
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

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  projectId: string;
  members: Member[];
  currentUserId: string;
  onCreated: () => void;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  orgId,
  projectId,
  members,
  currentUserId,
  onCreated,
}: CreateTaskDialogProps) {
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: { assignedTo: null, dueDate: null },
  });

  const onSubmit = async (data: CreateTaskInput) => {
    setLoading(true);
    try {
      await createTask({
        orgId,
        projectId,
        title: data.title,
        description: data.description ?? "",
        status: "todo",
        assignedTo: data.assignedTo ?? null,
        createdBy: currentUserId,
        dueDate: data.dueDate ? Timestamp.fromDate(new Date(data.dueDate)) : null,
        isBlocked: false,
      });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      console.error("Failed to create task:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" id="create-task-dialog">
        <DialogHeader>
          <DialogTitle>Append Directive</DialogTitle>
          <DialogDescription>
            Inject a new task vector. Assign an operator and set completion horizon.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-2">
          <div className="space-y-2.5">
            <Label htmlFor="task-title">Directive Title</Label>
            <Input
              id="task-title"
              placeholder="What needs to be done?"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-[12px] text-[#E57A7A]">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="task-description">Additional Context</Label>
            <Textarea
              id="task-description"
              placeholder="Provide execution details..."
              rows={3}
              {...register("description")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2.5">
              <Label>Operator</Label>
              <Select
                onValueChange={(val) =>
                  setValue("assignedTo", val === "unassigned" ? null : val)
                }
              >
                <SelectTrigger id="task-assignee">
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
              <Label htmlFor="task-due-date">Completion Horizon</Label>
              <Input
                id="task-due-date"
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
            <Button type="submit" disabled={loading} id="submit-create-task">
              {loading ? "Appending..." : "Append Directive"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
