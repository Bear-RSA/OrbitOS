"use client";

import { useState } from "react";
import { createProjectAction } from "@/app/actions/projects";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  createdBy: string;
  onSuccess: () => void;
}

export function CreateProjectDialog({ open, onOpenChange, orgId, createdBy, onSuccess }: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const result = await createProjectAction({
        name: name.trim(),
        orgId,
        uid: createdBy,
        ...(description.trim() && { description: description.trim() }),
      });

      if (!result.success) {
        setError(result.error || "Failed to initialize project");
        return;
      }

      setName("");
      setDescription("");
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError("Failed to initialize project");
    } finally {
      setLoading(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-10 bg-surface-sunken/95 border-line/[0.04]">
        <DialogHeader className="text-left sm:text-left space-y-4">
          <DialogTitle className="text-xl font-medium tracking-tight text-ink">
            Initialize Project
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-ink-dim font-light max-w-[360px]">
            Define a new project designation to launch a workspace vector.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          <div className="space-y-2.5">
            <Label htmlFor="project-name">Project Designation</Label>
            <Input
              id="project-name"
              placeholder="e.g. Acme Redesign"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>
          <div className="space-y-2.5">
            <Label htmlFor="project-description">Description <span className="text-ink-dim font-normal">(optional)</span></Label>
            <textarea
              id="project-description"
              placeholder="Brief overview of the project scope..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              maxLength={500}
              rows={3}
              className="w-full bg-surface-sunken border border-line/[0.1] rounded-lg px-3 py-2.5 text-[13px] font-mono text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:border-line/[0.2] disabled:opacity-50 resize-none"
            />
            <p className="text-[10px] font-mono text-ink-faint text-right">{description.length}/500</p>
          </div>
          {error && <p className="text-[13px] text-orbit-red">{error}</p>}
          <DialogFooter className="flex-row justify-start sm:justify-start gap-4 mt-10">
            <Button 
              type="submit" 
              disabled={!name.trim()} 
              isLoading={loading}
              variant="secondary"
              className="h-9 px-5 rounded-md text-[10px] font-mono uppercase tracking-[0.2em] min-w-[140px]"
            >
              Create Vector
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="h-9 px-5 rounded-lg text-[12px] text-ink-faint hover:text-ink-muted hover:bg-transparent"
            >
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
