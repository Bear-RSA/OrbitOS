"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Settings, Trash2, Archive, AlertCircle, AlertTriangle, ShieldAlert, Pencil, FileText } from "lucide-react";
import { deleteProjectAction, archiveProjectAction, renameProjectAction, updateProjectDescriptionAction } from "@/app/actions/projects";
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
  projectDescription?: string;
  uid: string;
  userRole?: string;
}

export function ProjectSettingsMenu({ projectId, projectName, projectDescription, uid, userRole }: ProjectSettingsMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveSuccess, setShowArchiveSuccess] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [newName, setNewName] = useState(projectName);
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [descriptionText, setDescriptionText] = useState(projectDescription || "");
  const [descriptionLoading, setDescriptionLoading] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  // Reset rename state when modal opens
  useEffect(() => {
    if (showRenameModal) {
      setNewName(projectName);
      setRenameError(null);
      setRenameLoading(false);
    }
  }, [showRenameModal, projectName]);

  const handleRename = async () => {
    if (renameLoading) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      setRenameError("Project name cannot be empty.");
      return;
    }
    if (trimmed === projectName) {
      setShowRenameModal(false);
      return;
    }

    setRenameLoading(true);
    setRenameError(null);
    try {
      const result = await renameProjectAction({ projectId, newName: trimmed, uid });
      if (!result.success) {
        throw new Error(result.error);
      }
      setShowRenameModal(false);
      router.refresh();
    } catch (err: any) {
      setRenameError(err?.message || "Rename failed. Please try again.");
    } finally {
      setRenameLoading(false);
    }
  };

  // Reset description state when modal opens
  useEffect(() => {
    if (showDescriptionModal) {
      setDescriptionText(projectDescription || "");
      setDescriptionError(null);
      setDescriptionLoading(false);
    }
  }, [showDescriptionModal, projectDescription]);

  const handleDescriptionSave = async () => {
    if (descriptionLoading) return;
    const trimmed = descriptionText.trim();
    if (trimmed === (projectDescription || "")) {
      setShowDescriptionModal(false);
      return;
    }

    setDescriptionLoading(true);
    setDescriptionError(null);
    try {
      const result = await updateProjectDescriptionAction({ projectId, description: trimmed, uid });
      if (!result.success) {
        throw new Error(result.error);
      }
      setShowDescriptionModal(false);
      router.refresh();
    } catch (err: any) {
      setDescriptionError(err?.message || "Failed to update description. Please try again.");
    } finally {
      setDescriptionLoading(false);
    }
  };

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

  const handleArchive = async () => {
    if (loading) return;

    setLoading(true);
    setErrorMsg(null);
    setOpen(false);
    try {
      const result = await archiveProjectAction({ projectId, uid });
      
      if (!result.success) {
        throw new Error(result.error);
      }

      setShowArchiveSuccess(true);
    } catch (err: any) {
      console.error("Failed to archive project", err);
      setErrorMsg(err?.message || "Archive operation failed. Please try again.");
    } finally {
      setLoading(false);
    }
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
              {/* Rename — available to OWNER and MEMBER */}
              <button
                onClick={() => { setOpen(false); setShowRenameModal(true); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#ededed] hover:bg-white/[0.04] transition-colors"
              >
                <Pencil className="w-4 h-4 text-[#888888]" />
                Rename Project
              </button>

              {/* Edit Description — available to OWNER and MEMBER */}
              <button
                onClick={() => { setOpen(false); setShowDescriptionModal(true); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#ededed] hover:bg-white/[0.04] transition-colors"
              >
                <FileText className="w-4 h-4 text-[#888888]" />
                Edit Description
              </button>

              {isOwner ? (
                <>
                  <div className="w-full h-px bg-white/[0.04] my-1" />

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
                </>
              ) : (
                <>
                  <div className="w-full h-px bg-white/[0.04] my-1" />
                  <div className="flex items-center gap-3 px-3 py-2.5 text-sm text-[#555555]">
                    <ShieldAlert className="w-4 h-4 text-[#444444]" />
                    <span className="text-[12px]">Owner actions only</span>
                  </div>
                </>
              )}
            </div>
            
            {isOwner && (
              <div className="px-3 py-2 bg-white/[0.02] border-t border-white/[0.02]">
                <p className="text-[10px] text-[#555555] font-mono leading-tight tracking-[0.05em] flex items-start gap-1.5">
                  <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5 text-orbit-red/50" />
                  Deletion performs a cascade cleanup removing all tasks.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Destructive Confirmation Modal */}
      <DestructiveActionModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDestruction}
        entityName={projectName}
      />

      {/* Archive Success Modal */}
      <Dialog open={showArchiveSuccess} onOpenChange={setShowArchiveSuccess}>
        <DialogContent className="bg-[#0A0A0A] border-white/[0.05] shadow-2xl p-6 sm:max-w-md">
          <DialogHeader className="space-y-3 flex flex-col items-center">
            <DialogTitle className="text-xl font-medium tracking-tight text-[#ededed] flex items-center justify-center gap-2 w-full">
              <Archive className="w-5 h-5 text-[#888888]" />
              Project Archived
            </DialogTitle>
            <DialogDescription className="text-sm text-[#888888] leading-relaxed text-center">
              Project archived. It is now hidden from the core workspace view.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 sm:justify-center w-full flex justify-center">
            <Button
              type="button"
              onClick={() => setShowArchiveSuccess(false)}
              className="bg-[#ededed] text-black hover:bg-white transition-colors w-full sm:w-auto px-8"
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Project Modal */}
      {showRenameModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" onClick={() => !renameLoading && setShowRenameModal(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm">
            <div className="bg-[#000000] border border-[#1a1a1a] rounded-xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
              <h3 className="text-[15px] font-mono font-medium text-[#ededed] mb-1 tracking-tight">
                Rename Project
              </h3>
              <p className="text-[12px] font-mono text-[#555555] mb-5">
                Enter a new name for this project.
              </p>

              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={renameLoading}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !renameLoading) handleRename();
                  if (e.key === "Escape" && !renameLoading) setShowRenameModal(false);
                }}
                className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg h-10 px-3 text-[13px] font-mono text-[#ededed] placeholder:text-[#333] transition-colors focus:outline-none focus:border-[#333] disabled:opacity-50"
                placeholder="Project name"
              />

              {renameError && (
                <div className="mt-3 text-[11px] font-mono text-orbit-red flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-orbit-red animate-pulse" />
                  {renameError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  type="button"
                  disabled={renameLoading}
                  onClick={() => setShowRenameModal(false)}
                  className="h-8 px-4 rounded-lg text-[12px] font-mono text-[#888] bg-[#0a0a0a] border border-[#1a1a1a] hover:bg-[#111] hover:text-[#ededed] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={renameLoading || !newName.trim()}
                  onClick={handleRename}
                  className="h-8 px-4 rounded-lg text-[12px] font-mono text-[#000] bg-[#ededed] hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {renameLoading ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Edit Description Modal */}
      {showDescriptionModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" onClick={() => !descriptionLoading && setShowDescriptionModal(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm">
            <div className="bg-[#000000] border border-[#1a1a1a] rounded-xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
              <h3 className="text-[15px] font-mono font-medium text-[#ededed] mb-1 tracking-tight">
                Edit Description
              </h3>
              <p className="text-[12px] font-mono text-[#555555] mb-5">
                Set a brief description for this project.
              </p>

              <textarea
                value={descriptionText}
                onChange={(e) => setDescriptionText(e.target.value)}
                disabled={descriptionLoading}
                autoFocus
                maxLength={500}
                rows={4}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && !descriptionLoading) setShowDescriptionModal(false);
                }}
                className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-3 py-2.5 text-[13px] font-mono text-[#ededed] placeholder:text-[#333] transition-colors focus:outline-none focus:border-[#333] disabled:opacity-50 resize-none"
                placeholder="Brief overview of the project scope..."
              />
              <p className="text-[10px] font-mono text-[#333333] text-right mt-1">{descriptionText.length}/500</p>

              {descriptionError && (
                <div className="mt-3 text-[11px] font-mono text-orbit-red flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-orbit-red animate-pulse" />
                  {descriptionError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  type="button"
                  disabled={descriptionLoading}
                  onClick={() => setShowDescriptionModal(false)}
                  className="h-8 px-4 rounded-lg text-[12px] font-mono text-[#888] bg-[#0a0a0a] border border-[#1a1a1a] hover:bg-[#111] hover:text-[#ededed] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={descriptionLoading}
                  onClick={handleDescriptionSave}
                  className="h-8 px-4 rounded-lg text-[12px] font-mono text-[#000] bg-[#ededed] hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {descriptionLoading ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

