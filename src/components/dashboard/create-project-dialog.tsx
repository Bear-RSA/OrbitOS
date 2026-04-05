"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  ownerId: string;
  onSuccess: () => void;
}

export function CreateProjectDialog({ open, onOpenChange, orgId, ownerId, onSuccess }: CreateProjectDialogProps) {
  const [name, setName] = useState("");
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
        ownerId,
        createdAt: Timestamp.now(),
      });
      setName("");
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Initialize Project</DialogTitle>
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
          {error && <p className="text-[13px] text-[#E57A7A]">{error}</p>}
          <div className="flex justify-end gap-3 pt-6 border-t border-white/[0.04]">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!name.trim()} 
              isLoading={loading}
            >
              Create Vector
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
