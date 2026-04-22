"use client";

import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils/classnames";

interface SuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
}

export function SuccessModal({ open, onOpenChange, title, description }: SuccessModalProps) {
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        onOpenChange(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity" />
      <div className="relative animate-in fade-in zoom-in-95 duration-300 flex flex-col items-center justify-center p-8 bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl text-center min-w-[300px]">
        <div className="w-14 h-14 rounded-full bg-[#85C89B]/10 flex items-center justify-center mb-5 border border-[#85C89B]/20">
          <CheckCircle2 className="w-7 h-7 text-[#85C89B]" />
        </div>
        <h3 className="text-xl font-medium text-white mb-2 tracking-tight">{title}</h3>
        {description && <p className="text-[13px] text-[#888] font-light max-w-[240px] leading-relaxed">{description}</p>}
      </div>
    </div>
  );
}
