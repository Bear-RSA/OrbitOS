"use client";

import { useState, useEffect, useId } from "react";
import { AlertTriangle, X } from "lucide-react";
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
    <Dialog open={isOpen} onOpenChange={(val) => !loading && onClose()}>
      <DialogContent 
        className="sm:max-w-[480px] border-destructive/20 p-10 rounded-[32px] gap-0 overflow-hidden"
        id="destructive-modal"
      >
        <DialogHeader className="space-y-4 mb-8">
          <DialogTitle className="flex items-center gap-3 text-destructive text-2xl font-light tracking-tight">
            <AlertTriangle className="w-6 h-6 shrink-0" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription className="text-ink-muted text-[15px] font-light leading-relaxed">
            {description || (
              <>
                You&apos;re about to delete <span className="font-semibold text-ink-strong">&quot;{entityName}&quot;</span>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Warning Box */}
          <div className="bg-orbit-red/[0.1] border border-destructive/10 rounded-2xl p-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-destructive/5 opacity-20 pointer-events-none" />
            <p className="text-[14px] text-destructive/90 font-light leading-relaxed relative z-10">
              {warningMessage}
            </p>
          </div>

          {/* Confirmation Input */}
          <div className="space-y-3">
            <label htmlFor={inputId} className="text-[13px] text-ink-muted block">
              Type <span className="font-medium text-ink">{targetConfirmText}</span> to confirm
            </label>
            <div className="relative">
              <input
                id={inputId}
                type="text"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={loading}
                placeholder="Type it here"
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && isMatch && !loading) {
                    handleConfirm();
                  }
                }}
                className={cn(
                  "w-full bg-surface-sunken border border-line/[0.06] rounded-xl h-12 px-5 text-[14px] font-light text-ink placeholder:text-ink-dim transition-all focus:outline-none focus:border-destructive/40 focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50",
                  isMatch && "border-destructive/20 bg-orbit-red/[0.06]"
                )}
              />
            </div>
          </div>

          {error && (
            <div id={errorId} role="alert" className="text-[13px] text-destructive animate-fade-in flex items-center gap-2 px-1">
              <div className="w-1.5 h-1.5 shrink-0 rounded-full bg-destructive" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-end gap-3 mt-10 pt-0 border-none">
          <Button
            type="button"
            variant="ghost"
            disabled={loading}
            onClick={onClose}
            className="h-11 px-8 rounded-xl text-[13px] font-medium text-ink bg-surface-sunken border border-line/[0.05] hover:bg-surface-control hover:text-ink-strong transition-all"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={loading || !isMatch}
            onClick={handleConfirm}
            className={cn(
              "h-11 px-8 rounded-xl text-[13px] font-medium text-ink-strong transition-all duration-500",
              isMatch 
                ? "bg-destructive hover:bg-orbit-red shadow-[0_0_20px_rgb(var(--orbit-red)_/_0.4)]" 
                : "bg-destructive/20 text-ink-strong/30 cursor-not-allowed"
            )}
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-line/30 border-t-white rounded-full animate-spin" />
                Deleting…
              </div>
            ) : (
              actionLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
