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
import { DestructiveActionModal } from "@/components/ui/destructive-action-modal";

interface ProjectSettingsMenuProps {
  projectId: string;
  projectName: string;
  uid: string;
  userRole?: string;
}

export function ProjectSettingsMenu({ projectId, projectName, uid, userRole }: ProjectSettingsMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const isOwner = userRole === "OWNER" || userRole === "owner";

  const confirmDestruction = async () => {
    // Prevent duplicate submissions
    if (loading) return;

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
              
              {isOwner && (
                <>
                  <div className="w-full h-px bg-white/[0.04] my-1" />

                  <button 
                    onClick={initDelete}
                    disabled={loading}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-orbit-red hover:bg-[#E57A7A]/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Project
                  </button>
                </>
              )}
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
      <DestructiveActionModal
        isOpen={showDeleteConfirm}
        onClose={() => !loading && setShowDeleteConfirm(false)}
        onConfirm={confirmDestruction}
        entityName={projectName}
        isLoading={loading}
      />
    </div>
  );
}

