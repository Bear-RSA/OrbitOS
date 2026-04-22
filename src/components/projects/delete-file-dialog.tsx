"use client";

import { useState } from "react";
import { ProjectFile } from "@/types/file";
import { DestructiveActionModal } from "@/components/ui/destructive-action-modal";

interface DeleteFileDialogProps {
  file: ProjectFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

export function DeleteFileDialog({
  file,
  open,
  onOpenChange,
  onConfirm,
}: DeleteFileDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to delete file:", err);
      throw err; // Re-throw so the modal can catch and display the error
    } finally {
      setIsDeleting(false);
    }
  };

  if (!file) return null;

  return (
    <DestructiveActionModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      onConfirm={handleDelete}
      entityName={file.name}
      title="Execute Deletion Protocol"
      description={
        <>
          System alert: You are about to purge asset <span className="text-destructive font-bold">#{file.id.slice(0, 4).toUpperCase()}</span> from the operational grid.
        </>
      }
      warningMessage="Both the index record and the physical cloud storage asset will be permanently destroyed. This action cannot be reversed."
      actionLabel="Confirm Deletion"
      isLoading={isDeleting}
    />
  );
}
