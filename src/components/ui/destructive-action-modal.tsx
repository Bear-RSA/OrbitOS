"use client";

import { useState, useEffect, useId } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DIALOG_FOOTER_CLASS, DialogHeading, DialogNotice } from "@/components/ui/dialog-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/classnames";

interface DestructiveActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<{ success: boolean; error?: string } | void>;
  title?: string;
  entityName: string;
  description?: React.ReactNode;
  warningMessage?: string;
  confirmText?: string;
  actionLabel?: string;
}

export function DestructiveActionModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Delete permanently?",
  entityName,
  description,
  warningMessage = "This can't be undone. Everything inside it is deleted with it, for everyone in the workspace.",
  confirmText,
  actionLabel = "Delete",
}: DestructiveActionModalProps) {
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = `${inputId}-error`;

  const targetConfirmText = confirmText || entityName;
  const isMatch = inputValue.trim().toLowerCase() === targetConfirmText.trim().toLowerCase();

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setInputValue("");
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!isMatch || loading) return;

    setLoading(true);
    setError(null);
    try {
      const result = await onConfirm();

      // If onConfirm returns a result object, inspect it for failure
      if (result && !result.success) {
        setError(result.error || "That didn't go through. Nothing was deleted. Try again in a moment.");
        setLoading(false);
        return;
      }

      // Success — reset loading (modal will likely unmount via onClose from parent)
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || "That didn't go through. Nothing was deleted. Try again in a moment.");
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => !loading && onClose()}>
      <DialogContent className="sm:max-w-[480px]" id="destructive-modal">
        <DialogHeading
          icon={AlertTriangle}
          tone="red"
          title={title}
          description={
            <>
              {entityName && (
                <span className="mb-1 block truncate font-normal text-ink">{entityName}</span>
              )}
              {description || "You're about to delete this."}
            </>
          }
        />

        <div className="space-y-5">
          <DialogNotice tone="red">{warningMessage}</DialogNotice>

          {/* Typing the name is the speed bump: it can't be clicked through on autopilot. */}
          <div className="space-y-2.5">
            <label htmlFor={inputId} className="block text-[12px] text-ink-dim">
              Type <span className="font-medium text-ink">{targetConfirmText}</span> to confirm
            </label>
            <Input
              id={inputId}
              type="text"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={loading}
              placeholder={targetConfirmText}
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter" && isMatch && !loading) {
                  handleConfirm();
                }
              }}
              className={cn(isMatch && "ring-1 ring-orbit-red/30 focus-visible:ring-orbit-red/40")}
            />
          </div>

          {error && (
            <p id={errorId} role="alert" className="flex items-center gap-2 px-1 text-[13px] text-orbit-red animate-fade-in">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orbit-red" />
              {error}
            </p>
          )}
        </div>

        <DialogFooter className={cn(DIALOG_FOOTER_CLASS, "gap-2")}>
          <Button type="button" variant="ghost" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!isMatch}
            isLoading={loading}
            onClick={handleConfirm}
            className={cn(isMatch && "bg-orbit-red/20 ring-1 ring-inset ring-orbit-red/30 hover:bg-orbit-red/30")}
          >
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
