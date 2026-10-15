"use client";

import { useEffect, useState } from "react";
import { Crown, Network, UserMinus } from "lucide-react";

import {
  assignDepartmentAction,
  promoteToOwnerAction,
  removeOwnerRoleAction,
  setDepartmentLeadAction,
  transferMainOwnerAction,
} from "@/app/actions/team-structure";
import type { TeamStructure } from "@/app/actions/team-structure";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DialogHeading, DialogNotice } from "@/components/ui/dialog-parts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import { memberDisplayName } from "@/lib/members/profile";
import { cn } from "@/lib/utils/classnames";
import type { Member } from "@/types/member";

/* ------------------------------------------------------------------ */
/*  Manage one person's place in the workspace                         */
/*                                                                     */
/*  What shows depends on who is looking:                              */
/*    any owner     a member's department, and whether they lead it    */
/*    account holder  also make owner / remove owner / hand over the   */
/*                                                                     */
/*  Every button re-checks on the server; hiding them here only keeps  */
/*  the dialog from offering something that would be refused.         */
/* ------------------------------------------------------------------ */

const NO_DEPARTMENT = "__none__";

/* Each concern sits on its own quiet card, so the dialog scans as blocks. */
const SECTION_CLASS = "space-y-3 rounded-2xl bg-surface-raised/40 p-4 ring-1 ring-inset ring-line/[0.05]";
const SECTION_LABEL_CLASS = "flex items-center gap-2 text-[12px] font-medium text-ink-muted";

type ActionResult = { success: true } | { success: false; error: string };

interface ManageMemberDialogProps {
  member: Member | null;
  structure: TeamStructure;
  viewerIsAccountHolder: boolean;
  onClose: () => void;
  /** Called after any change lands, so the page can reload the tree. */
  onChanged: () => Promise<void> | void;
  /** Hands off to the page's remove-member confirmation. */
  onRemove: (uid: string) => void;
}

export function ManageMemberDialog({
  member,
  structure,
  viewerIsAccountHolder,
  onClose,
  onChanged,
  onRemove,
}: ManageMemberDialogProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmTransfer, setConfirmTransfer] = useState(false);

  // A fresh dialog per person: no stale error or half-made confirmation.
  useEffect(() => {
    setError(null);
    setConfirmTransfer(false);
    setBusy(null);
  }, [member?.id]);

  if (!member) return null;

  const name = memberDisplayName(member);
  const isOwner = member.role === "OWNER";
  const department = structure.departments.find((d) => d.id === member.departmentId) ?? null;
  const isLead = department?.leadId === member.id;

  const { current, limit } = structure.ownerSeats;
  const seatsFull = limit !== -1 && current >= limit;
  const promoteBlocked = structure.limitsEnforced && seatsFull;

  const run = async (key: string, action: () => Promise<ActionResult>, closeAfter = false) => {
    setBusy(key);
    setError(null);
    try {
      const result = await action();
      if (!result.success) {
        setError(result.error);
        return;
      }
      await onChanged();
      if (closeAfter) onClose();
    } catch (err) {
      console.error("[ManageMember] Action failed:", err);
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={!!member} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeading
          leading={<UserAvatar photoURL={member.photoURL} name={member.name} size="lg" />}
          title={<span className="block truncate">{name}</span>}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-normal ring-1 ring-inset",
                  isOwner
                    ? "bg-orbit-amber/10 text-orbit-amber ring-orbit-amber/20"
                    : "bg-surface-control text-ink-muted ring-line/[0.08]"
                )}
              >
                {isOwner && <Crown className="h-3 w-3" aria-hidden />}
                {isOwner ? "Owner" : isLead && department ? department.leadTitle : "Member"}
              </span>
              {!isOwner && <span className="truncate">{department ? department.name : "No department"}</span>}
            </span>
          }
        />

        <div className="space-y-3">
          {error && <DialogNotice tone="red">{error}</DialogNotice>}

          {/* Department: members only. Owners sit above departments. */}
          {!isOwner && (
            <section className={SECTION_CLASS}>
              <h4 className={SECTION_LABEL_CLASS}>
                <Network className="h-3.5 w-3.5" aria-hidden />
                Department
              </h4>
              {structure.departments.length === 0 ? (
                <p className="text-[13px] text-ink-muted">
                  No departments yet. Create one from the Structure section on Teams.
                </p>
              ) : (
                <Select
                  value={member.departmentId ?? NO_DEPARTMENT}
                  disabled={busy !== null}
                  onValueChange={(value) =>
                    run("department", () =>
                      assignDepartmentAction({
                        memberUid: member.id,
                        departmentId: value === NO_DEPARTMENT ? null : value,
                      })
                    )
                  }
                >
                  <SelectTrigger aria-label="Department">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DEPARTMENT}>No department</SelectItem>
                    {structure.departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {department && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy !== null}
                  isLoading={busy === "lead"}
                  onClick={() =>
                    run("lead", () =>
                      setDepartmentLeadAction({
                        departmentId: department.id,
                        memberUid: isLead ? null : member.id,
                      })
                    )
                  }
                >
                  {isLead
                    ? `Remove as ${department.leadTitle.toLowerCase()}`
                    : `Make ${department.leadTitle.toLowerCase()} of ${department.name}`}
                </Button>
              )}
            </section>
          )}

          {/* Ownership: the account holder's alone. */}
          {viewerIsAccountHolder && (
            <section className={SECTION_CLASS}>
              <div className="flex items-center justify-between gap-3">
                <h4 className={SECTION_LABEL_CLASS}>
                  <Crown className="h-3.5 w-3.5" aria-hidden />
                  Ownership
                </h4>
                <span className="font-mono text-[11px] text-ink-muted tabular-nums">
                  {current} / {limit === -1 ? "∞" : limit} seats
                </span>
              </div>
              {limit !== -1 && (
                <div
                  className="h-1 overflow-hidden rounded-full bg-surface-control"
                  role="meter"
                  aria-label="Owner seats used"
                  aria-valuenow={current}
                  aria-valuemin={0}
                  aria-valuemax={limit}
                >
                  <div
                    className={cn("h-full rounded-full", seatsFull ? "bg-orbit-amber" : "bg-ink/40")}
                    style={{ width: `${Math.min(100, (current / Math.max(limit, 1)) * 100)}%` }}
                  />
                </div>
              )}

              {!isOwner ? (
                <>
                  <Button
                    className="w-full"
                    disabled={busy !== null || promoteBlocked}
                    isLoading={busy === "promote"}
                    onClick={() => run("promote", () => promoteToOwnerAction({ targetUid: member.id }))}
                  >
                    <Crown className="h-3.5 w-3.5" />
                    Make owner
                  </Button>
                  <p className="text-[12px] leading-relaxed text-ink-dim">
                    {promoteBlocked
                      ? "Every owner seat on your plan is taken. Upgrade in Settings → Billing to add more."
                      : "Owners get the yellow card and the same access as you: billing, the Vault, departments and every seat. Only you can change who is an owner."}
                  </p>
                </>
              ) : confirmTransfer ? (
                <div className="space-y-3 rounded-xl bg-orbit-amber/[0.07] p-4 ring-1 ring-inset ring-orbit-amber/15">
                  <p className="text-[13px] leading-relaxed text-ink">
                    Make {name} the account holder? You stay an owner, but they decide who else is an
                    owner from now on, including you.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={busy !== null}
                      onClick={() => setConfirmTransfer(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={busy !== null}
                      isLoading={busy === "transfer"}
                      onClick={() =>
                        run("transfer", () => transferMainOwnerAction({ targetUid: member.id }), true)
                      }
                    >
                      Hand it over
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={busy !== null}
                    onClick={() => setConfirmTransfer(true)}
                  >
                    Make account holder
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    disabled={busy !== null}
                    isLoading={busy === "demote"}
                    onClick={() => run("demote", () => removeOwnerRoleAction({ targetUid: member.id }))}
                  >
                    Remove owner role
                  </Button>
                </div>
              )}
            </section>
          )}

          {/* Any owner can remove a member; only the account holder can remove an owner. */}
          {(!isOwner || viewerIsAccountHolder) && (
            <section className="!mt-6 border-t border-line/[0.06] pt-5">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2.5 px-3 text-orbit-red hover:bg-orbit-red/10 hover:text-orbit-red"
                disabled={busy !== null}
                onClick={() => {
                  onClose();
                  onRemove(member.id);
                }}
              >
                <UserMinus className="h-4 w-4" aria-hidden />
                Remove from workspace
              </Button>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
