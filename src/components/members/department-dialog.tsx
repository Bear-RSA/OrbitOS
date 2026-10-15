"use client";

import { useEffect, useState } from "react";
import { Network, PencilLine } from "lucide-react";

import { createDepartmentAction, renameDepartmentAction } from "@/app/actions/team-structure";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DIALOG_FOOTER_CLASS, DialogHeading, DialogNotice } from "@/components/ui/dialog-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/classnames";
import {
  DEFAULT_LEAD_TITLE,
  MAX_DEPARTMENT_NAME_LENGTH,
  MAX_LEAD_TITLE_LENGTH,
} from "@/lib/members/hierarchy";
import type { Department } from "@/types/department";

/** Create a department, or edit its name and lead title when `department` is given. */
export function DepartmentDialog({
  open,
  department,
  onClose,
  onSaved,
}: {
  open: boolean;
  department: Department | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [leadTitle, setLeadTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(department?.name ?? "");
      setLeadTitle(department?.leadTitle ?? DEFAULT_LEAD_TITLE);
      setError(null);
    }
  }, [open, department]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = department
        ? await renameDepartmentAction({ departmentId: department.id, name, leadTitle })
        : await createDepartmentAction({ name, leadTitle });
      if (!result.success) {
        setError(result.error);
        return;
      }
      await onSaved();
      onClose();
    } catch (err) {
      console.error("[DepartmentDialog] Save failed:", err);
      setError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeading
          icon={department ? PencilLine : Network}
          title={department ? "Edit department" : "New department"}
          description={
            department
              ? "Everyone in it stays where they are."
              : "Group people under a lead. You can file members into it from the tree."
          }
        />

        <form onSubmit={submit}>
          <div className="space-y-5">
            {error && <DialogNotice tone="red">{error}</DialogNotice>}

            <div className="space-y-2.5">
              <Label htmlFor="department-name" className="block text-[12px] text-ink-dim">
                Name
              </Label>
              <Input
                id="department-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={MAX_DEPARTMENT_NAME_LENGTH}
                placeholder="Client Delivery"
                disabled={saving}
                autoFocus
              />
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="department-lead-title" className="block text-[12px] text-ink-dim">
                What do you call its lead?
              </Label>
              <Input
                id="department-lead-title"
                value={leadTitle}
                onChange={(e) => setLeadTitle(e.target.value)}
                maxLength={MAX_LEAD_TITLE_LENGTH}
                placeholder="Team lead"
                disabled={saving}
              />
              <p className="text-[12px] text-ink-dim">Shown on the tree. Leave blank for “{DEFAULT_LEAD_TITLE}”.</p>
            </div>
          </div>

          <DialogFooter className={cn(DIALOG_FOOTER_CLASS, "gap-2")}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()} isLoading={saving}>
              {department ? "Save" : "Create department"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
