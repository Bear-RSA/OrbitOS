"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Settings, Trash2, Archive, ArchiveRestore, AlertCircle, AlertTriangle, ShieldAlert, Pencil, FileText } from "lucide-react";
import { deleteProjectAction, archiveProjectAction, unarchiveProjectAction, renameProjectAction, updateProjectDescriptionAction } from "@/app/actions/projects";
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
  isArchived?: boolean;
  onArchiveChange?: () => void;
}

export function ProjectSettingsMenu({ projectId, projectName, projectDescription, uid, userRole, isArchived, onArchiveChange }: ProjectSettingsMenuProps) {
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

  const isOwner = userRole === "OWNER";

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

      // Refresh the caller so the header reflects the archived state even
      // while the confirmation is still up.
      onArchiveChange?.();
      setShowArchiveSuccess(true);
    } catch (err: any) {
      console.error("Failed to archive project", err);
      setErrorMsg(err?.message || "Archive operation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUnarchive = async () => {
    if (loading) return;

    setLoading(true);
    setErrorMsg(null);
    setOpen(false);
    try {
      const result = await unarchiveProjectAction({ projectId, uid });

      if (!result.success) {
        throw new Error(result.error);
      }

      onArchiveChange?.();
      router.refresh();
    } catch (err: any) {
      console.error("Failed to restore project", err);
      setErrorMsg(err?.message || "Restore operation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // The archived project drops out of every workspace listing, so there is
  // nothing left to look at on its page — send the owner back to the dashboard,
  // where the Archived shelf can restore it.
  const dismissArchiveSuccess = () => {
    setShowArchiveSuccess(false);
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-control hover:bg-surface-hover text-ink-muted hover:text-ink shadow-[0_2px_8px_rgb(var(--scrim)_/_0.4)] transition-all ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none"
      >
        <Settings className="w-4 h-4" />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 w-56 rounded-xl bg-surface-sunken border border-line/[0.05] shadow-2xl overflow-hidden z-50 animate-fade-in origin-top-right">
            <div className="p-2 space-y-1">
              {/* Rename — available to OWNER and MEMBER */}
              <button
                onClick={() => { setOpen(false); setShowRenameModal(true); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-ink hover:bg-surface-raised transition-colors"
              >
                <Pencil className="w-4 h-4 text-ink-muted" />
                Rename Project
              </button>

              {/* Edit Description — available to OWNER and MEMBER */}
              <button
                onClick={() => { setOpen(false); setShowDescriptionModal(true); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-ink hover:bg-surface-raised transition-colors"
              >
                <FileText className="w-4 h-4 text-ink-muted" />
                Edit Description
              </button>

              {isOwner ? (
                <>
                  <div className="w-full h-px bg-surface-raised my-1" />

                  <button 
                    onClick={isArchived ? handleUnarchive : handleArchive}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-ink hover:bg-surface-raised transition-colors"
                    disabled={loading}
                  >
                    {isArchived ? (
                      <ArchiveRestore className="w-4 h-4 text-ink-muted" />
                    ) : (
                      <Archive className="w-4 h-4 text-ink-muted" />
                    )}
                    {loading ? "Working…" : isArchived ? "Restore Project" : "Archive Project"}
                  </button>

                  <div className="w-full h-px bg-surface-raised my-1" />

                  <button 
                    onClick={initDelete}
                    disabled={loading}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-orbit-red hover:bg-orbit-red/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Project
                  </button>
                </>
              ) : (
                <>
                  <div className="w-full h-px bg-surface-raised my-1" />
                  <div className="flex items-center gap-3 px-3 py-2.5 text-sm text-ink-dim">
                    <ShieldAlert className="w-4 h-4 text-ink-faint" />
                    <span className="text-[12px]">Owner actions only</span>
                  </div>
                </>
              )}
            </div>
            
            {isOwner && (
              <div className="px-3 py-2 bg-surface-card border-t border-line/[0.02]">
                <p className="text-[10px] text-ink-dim font-mono leading-tight tracking-[0.05em] flex items-start gap-1.5">
                  <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5 text-orbit-red/50" />
                  Deletion performs a cascade cleanup removing all tasks.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Action Error — archive/restore/delete failures were previously set on
          state and never rendered, so a rejected action looked like a no-op. */}
      {errorMsg && !showDeleteConfirm && (
        <div
          role="alert"
          className="absolute right-0 top-12 z-50 w-64 rounded-xl bg-surface-sunken border border-orbit-red/20 shadow-2xl p-3"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-orbit-red" />
            <p className="text-[11px] leading-relaxed text-ink-muted">{errorMsg}</p>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="mt-2 w-full text-[10px] font-mono uppercase tracking-[0.12em] text-ink-dim hover:text-ink transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Destructive Confirmation Modal */}
      <DestructiveActionModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDestruction}
        entityName={projectName}
      />

      {/* Archive Success Modal */}
      <Dialog open={showArchiveSuccess} onOpenChange={(next) => { if (!next) dismissArchiveSuccess(); }}>
        <DialogContent className="bg-surface-sunken border-line/[0.05] shadow-2xl p-6 sm:max-w-md">
          <DialogHeader className="space-y-3 flex flex-col items-center">
            <DialogTitle className="text-xl font-medium tracking-tight text-ink flex items-center justify-center gap-2 w-full">
              <Archive className="w-5 h-5 text-ink-muted" />
              Project Archived
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-muted leading-relaxed text-center">
              Project archived. It is now hidden from the core workspace view. You can restore it from the archive at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 sm:justify-center w-full flex justify-center">
            <Button
              type="button"
              onClick={dismissArchiveSuccess}
              className="bg-ink text-black hover:bg-ink-strong transition-colors w-full sm:w-auto px-8"
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Project Modal */}
      {showRenameModal && (
        <>
          <div className="fixed inset-0 z-50 bg-scrim/80 backdrop-blur-sm" onClick={() => !renameLoading && setShowRenameModal(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm">
            <div className="bg-base border border-line/[0.1] rounded-xl p-6 shadow-overlay">
              <h3 className="text-[15px] font-mono font-medium text-ink mb-1 tracking-tight">
                Rename Project
              </h3>
              <p className="text-[12px] font-mono text-ink-dim mb-5">
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
                className="w-full bg-surface-sunken border border-line/[0.1] rounded-lg h-10 px-3 text-[13px] font-mono text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:border-line/[0.2] disabled:opacity-50"
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
                  className="h-8 px-4 rounded-lg text-[12px] font-mono text-ink-muted bg-surface-sunken border border-line/[0.1] hover:bg-surface-control hover:text-ink transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={renameLoading || !newName.trim()}
                  onClick={handleRename}
                  className="h-8 px-4 rounded-lg text-[12px] font-mono text-on-ink bg-ink hover:bg-ink-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="fixed inset-0 z-50 bg-scrim/80 backdrop-blur-sm" onClick={() => !descriptionLoading && setShowDescriptionModal(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm">
            <div className="bg-base border border-line/[0.1] rounded-xl p-6 shadow-overlay">
              <h3 className="text-[15px] font-mono font-medium text-ink mb-1 tracking-tight">
                Edit Description
              </h3>
              <p className="text-[12px] font-mono text-ink-dim mb-5">
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
                className="w-full bg-surface-sunken border border-line/[0.1] rounded-lg px-3 py-2.5 text-[13px] font-mono text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:border-line/[0.2] disabled:opacity-50 resize-none"
                placeholder="Brief overview of the project scope..."
              />
              <p className="text-[10px] font-mono text-ink-faint text-right mt-1">{descriptionText.length}/500</p>

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
                  className="h-8 px-4 rounded-lg text-[12px] font-mono text-ink-muted bg-surface-sunken border border-line/[0.1] hover:bg-surface-control hover:text-ink transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={descriptionLoading}
                  onClick={handleDescriptionSave}
                  className="h-8 px-4 rounded-lg text-[12px] font-mono text-on-ink bg-ink hover:bg-ink-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

