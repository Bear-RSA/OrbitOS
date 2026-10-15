"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DIALOG_FOOTER_CLASS, DialogHeading } from "@/components/ui/dialog-parts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/classnames";
import { AlertTriangle, HelpCircle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  loading = false,
}: ConfirmDialogProps) {
  const isDestructive = variant === "destructive";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeading
          icon={isDestructive ? AlertTriangle : HelpCircle}
          tone={isDestructive ? "red" : "neutral"}
          title={title}
          description={
            <>
              {description}
              {isDestructive && <span className="mt-2 block text-orbit-red/90">This can&apos;t be undone.</span>}
            </>
          }
        />

        <DialogFooter className={cn(DIALOG_FOOTER_CLASS, "mt-2 gap-2")}>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            isLoading={loading}
            variant={isDestructive ? "destructive" : "default"}
            className={cn(isDestructive && "ring-1 ring-inset ring-orbit-red/25")}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
