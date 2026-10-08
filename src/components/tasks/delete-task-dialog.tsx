"use client";

import { Task } from "@/types/task";
import { DestructiveActionModal } from "@/components/ui/destructive-action-modal";

interface DeleteTaskDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

export function DeleteTaskDialog({
  task,
  open,
  onOpenChange,
  onConfirm,
}: DeleteTaskDialogProps) {
  const handleDelete = async () => {
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to delete task:", err);
      throw err; // Re-throw so the modal can catch and display the error
    }
  };

  if (!task) return null;

  return (
    <DestructiveActionModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      onConfirm={handleDelete}
      entityName={task.title}
      title="Delete this task?"
      description={
        <>
          You&apos;re about to delete <span className="font-semibold text-ink-strong">{task.title}</span>.
        </>
      }
      warningMessage="This can't be undone. The deletion shows in the project's activity log."
      actionLabel="Delete task"
    />
  );
}
