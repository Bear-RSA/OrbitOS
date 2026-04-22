"use client";

import { useState } from "react";
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
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to delete task:", err);
      throw err; // Re-throw so the modal can catch and display the error
    } finally {
      setIsDeleting(false);
    }
  };

  if (!task) return null;

  return (
    <DestructiveActionModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      onConfirm={handleDelete}
      entityName={task.title}
      title="Terminate Directive"
      description={
        <>
          System alert: You are about to purge directive <span className="text-destructive font-bold">#{task.id.slice(0, 4).toUpperCase()}</span> from the operational grid.
        </>
      }
      warningMessage="Action Status: Irreversible. This execution will be logged to the telemetry stream and cannot be undone."
      actionLabel="Confirm Purge"
      isLoading={isDeleting}
    />
  );
}
