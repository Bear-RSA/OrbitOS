"use client";

import { useState } from "react";
import { db } from "@/lib/firebase/client";
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
import { addDoc, collection, Timestamp } from "firebase/firestore";

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
      await addDoc(collection(db, "projects"), {
        name: name.trim(),
        orgId,
        ownerId: createdBy,
        createdBy,
        createdAt: Timestamp.now(),
        ...(description.trim() && { description: description.trim() }),
      });
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
      <DialogContent className="sm:max-w-[480px] p-10 bg-[#080808]/95 border-white/[0.04]">
        <DialogHeader className="text-left sm:text-left space-y-4">
          <DialogTitle className="text-xl font-medium tracking-tight text-[#ededed]">
            Initialize Project
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-[#666666] font-light max-w-[360px]">
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
            <Label htmlFor="project-description">Description <span className="text-[#555555] font-normal">(optional)</span></Label>
            <textarea
              id="project-description"
              placeholder="Brief overview of the project scope..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              maxLength={500}
              rows={3}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-3 py-2.5 text-[13px] font-mono text-[#ededed] placeholder:text-[#333] transition-colors focus:outline-none focus:border-[#333] disabled:opacity-50 resize-none"
            />
            <p className="text-[10px] font-mono text-[#333333] text-right">{description.length}/500</p>
          </div>
          {error && <p className="text-[13px] text-[#E57A7A]">{error}</p>}
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
              className="h-9 px-5 rounded-lg text-[12px] text-[#444444] hover:text-[#888888] hover:bg-transparent"
            >
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
