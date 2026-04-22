"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/classnames";
import { AlertTriangle } from "lucide-react";

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
      <DialogContent className="sm:max-w-[420px] p-0 bg-[#080808]/95 border-white/[0.04] overflow-hidden backdrop-blur-xl">
        {isDestructive && (
          <div className="h-1.5 w-full bg-orbit-red/10">
            <div className="h-full bg-orbit-red animate-[shimmer_2s_infinite_linear]" style={{ width: '40%', background: 'linear-gradient(90deg, transparent, #ff4444, transparent)' }} />
          </div>
        )}
        
        <div className="p-8 space-y-6">
          <div className="flex items-center gap-4">
            {isDestructive && (
              <div className="w-10 h-10 rounded-full bg-orbit-red/10 flex items-center justify-center ring-1 ring-orbit-red/20 shadow-[0_0_15px_rgba(229,122,122,0.1)]">
                <AlertTriangle className="w-5 h-5 text-orbit-red" />
              </div>
            )}
            <DialogHeader className="text-left p-0">
              <DialogTitle className="text-lg font-medium tracking-tight text-[#ededed]">
                {title}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="space-y-4">
            <DialogDescription className="text-[13px] leading-relaxed text-[#888888] font-light font-mono">
              {description}
            </DialogDescription>
            
            {isDestructive && (
              <p className="text-[10px] text-[#555555] uppercase tracking-[0.2em] font-mono leading-tight">
                Action Status: <span className="text-orbit-red/60 italic">Irreversible</span> // Logged to Telemetry
              </p>
            )}
          </div>

          <DialogFooter className="flex-row justify-end gap-3 mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="h-9 px-5 rounded-lg text-[10px] uppercase tracking-[0.2em] text-[#444] hover:text-[#888] hover:bg-white/[0.03] transition-all"
            >
              [{cancelText}]
            </Button>
            <Button 
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }} 
              isLoading={loading}
              className={cn(
                "h-9 px-6 rounded-lg text-[10px] uppercase tracking-[0.2em] transition-all duration-500",
                isDestructive 
                  ? "bg-orbit-red/10 border border-orbit-red/20 text-orbit-red hover:bg-orbit-red hover:text-black shadow-[0_0_20px_rgba(229,122,122,0.1)] hover:shadow-[0_0_30px_rgba(229,122,122,0.3)]"
                  : "bg-white/[0.05] border border-white/[0.1] text-[#ededed] hover:bg-[#ededed] hover:text-black"
              )}
            >
              {confirmText}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
