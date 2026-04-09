"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Trash2, Archive, AlertCircle, AlertTriangle } from "lucide-react";
import { deleteProjectAction } from "@/app/actions/projects";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ProjectSettingsMenuProps {
  projectId: string;
  projectName: string;
  uid: string;
}

export function ProjectSettingsMenu({ projectId, projectName, uid }: ProjectSettingsMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  // Typed confirmation must match exactly
  const isConfirmMatch = confirmText.trim() === projectName;

  const confirmDestruction = async () => {
    // Prevent duplicate submissions
    if (loading || !isConfirmMatch) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await deleteProjectAction({ projectId, uid });
      
      if (!result.success) {
        throw new Error(result.error);
      }

      console.log(`[ProjectSettings] Deleted project ${projectId} (${result.deletedTasks} tasks cascade-removed)`);
      setShowDeleteConfirm(false);
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      console.error("Failed to delete project", err);
      setErrorMsg(err?.message || "Deletion cascade failed. Please check network integrity.");
      setLoading(false);
    }
  };

  const initDelete = () => {
    setOpen(false);
    setConfirmText("");
    setErrorMsg(null);
    setShowDeleteConfirm(true);
  };

  const handleArchive = () => {
    alert("Project archived. It is now hidden from the core workspace view.");
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#111111] hover:bg-[#1a1a1a] text-[#888888] hover:text-[#ededed] shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-all ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none"
      >
        <Settings className="w-4 h-4" />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 w-56 rounded-xl bg-[#0A0A0A] border border-white/[0.05] shadow-2xl overflow-hidden z-50 animate-fade-in origin-top-right">
            <div className="p-2 space-y-1">
              <button 
                onClick={handleArchive}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#ededed] hover:bg-white/[0.04] transition-colors"
                disabled={loading}
              >
                <Archive className="w-4 h-4 text-[#888888]" />
                Archive Project
              </button>
              
              <div className="w-full h-px bg-white/[0.04] my-1" />

              <button 
                onClick={initDelete}
                disabled={loading}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-orbit-red hover:bg-[#E57A7A]/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Project
              </button>
            </div>
            
            <div className="px-3 py-2 bg-white/[0.02] border-t border-white/[0.02]">
               <p className="text-[10px] text-[#555555] font-mono leading-tight tracking-[0.05em] flex items-start gap-1.5">
                  <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5 text-orbit-red/50" />
                  Deletion performs a cascade cleanup removing all tasks.
               </p>
            </div>
          </div>
        </>
      )}

      {/* Destructive Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={(val) => !loading && setShowDeleteConfirm(val)}>
        <DialogContent className="sm:max-w-md border-[#E57A7A]/20 bg-[#050505]" id="delete-confirmation-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#E57A7A]">
              <AlertTriangle className="w-5 h-5" />
              Destructive Action Protocol
            </DialogTitle>
            <DialogDescription className="text-[#888888] pt-3">
              You are about to permanently eradicate <span className="font-semibold text-white">"{projectName}"</span>.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
             <div className="bg-[#1A0A0A] border border-[#E57A7A]/10 rounded-lg p-4">
                <p className="text-[13px] text-[#E57A7A]/90 font-light leading-relaxed">
                  This execution will trigger a cascade wipe. All metadata, configuration, and integrated task vectors associated with this project will be irreversibly destroyed.
                </p>
             </div>

             {/* Typed confirmation safeguard */}
             <div className="space-y-2">
               <label className="text-[11px] font-mono text-[#555555] uppercase tracking-[0.15em] block">
                 Type <span className="text-[#ededed]">"{projectName}"</span> to confirm
               </label>
               <input
                 type="text"
                 value={confirmText}
                 onChange={(e) => setConfirmText(e.target.value)}
                 disabled={loading}
                 placeholder={projectName}
                 autoComplete="off"
                 className="w-full bg-[#111111] border border-white/[0.06] rounded-lg h-10 px-4 text-[13px] font-light text-[#ededed] placeholder:text-[#333333] transition-all focus:outline-none focus:border-[#E57A7A]/40 disabled:opacity-50"
                 id="delete-confirm-input"
               />
             </div>

             {errorMsg && (
                <div className="text-[12px] font-mono text-[#E57A7A] animate-fade-in flex items-center gap-2">
                  <AlertCircle className="w-3 h-3" />
                  {errorMsg}
                </div>
             )}
          </div>

          <DialogFooter className="gap-2 sm:justify-end border-t border-white/[0.04] pt-6">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => setShowDeleteConfirm(false)}
              className="text-[#ededed] border-white/10 hover:bg-white/5 hover:text-white"
            >
              Abort
            </Button>
            <Button 
              type="button" 
              variant="destructive"
              disabled={loading || !isConfirmMatch}
              onClick={confirmDestruction}
              className="bg-[#E57A7A] hover:bg-[#D46969] text-white shadow-lg shadow-[#E57A7A]/20 transition-all font-medium disabled:opacity-40 disabled:hover:bg-[#E57A7A]"
            >
              {loading ? "Eradicating Context..." : "Confirm Destruction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

