"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Award, Crown, KeyRound, Network, UserMinus } from "lucide-react";

import {
  setDepartmentLeadAction,
  setMemberRankAction,
} from "@/app/actions/team-structure";
import type { TeamStructure } from "@/app/actions/team-structure";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DialogHeading, DialogNotice } from "@/components/ui/dialog-parts";
import { RANK_TEXT } from "@/components/ui/rank-styles";
import { UserAvatar } from "@/components/ui/user-avatar";
import { invalidateTeamLeads } from "@/hooks/use-member-rank";
import { memberDisplayName } from "@/lib/members/profile";
import {
  normaliseRole,
  RANK_LABEL,
  rankLevel,
  rankOf,
  type AssignableRank,
  type StoredRole,
} from "@/lib/members/rank";
import { cn } from "@/lib/utils/classnames";
import type { Member } from "@/types/member";

/* ------------------------------------------------------------------ */
/*  Manage one person's place in the workspace                         */
/*                                                                     */
/*  What shows depends on who is looking:                              */
/*    manager+      whether they lead their department                 */
/*    executive+    their rank, for people below the viewer            */
/*    any owner     removing a member from the workspace               */
/*    Internal Management  a link to Admin Tools, where owners change  */
/*                                                                     */
/*  Every button re-checks on the server; hiding them here only keeps  */
/*  the dialog from offering something that would be refused.         */
/* ------------------------------------------------------------------ */

/* Each concern sits on its own quiet card, so the dialog scans as blocks. */
const SECTION_CLASS = "space-y-3 rounded-2xl bg-surface-raised/40 p-4 ring-1 ring-inset ring-line/[0.05]";
const SECTION_LABEL_CLASS = "flex items-center gap-2 text-[12px] font-medium text-ink-muted";

type ActionResult = { success: true } | { success: false; error: string };

/* What each rank means, in the words the picker shows under it. */
const RANK_HINT: Record<AssignableRank, string> = {
  EXECUTIVE: "Same powers as an Owner. Counts against your plan's Executive seats.",
  MANAGER: "Can invite outside guests to meetings and choose department leads.",
  TEAM_LEAD: "Can lead a department and start group calls.",
  MEMBER: "No rank. Calls and meetings with people in the workspace.",
};

interface ManageMemberDialogProps {
  member: Member | null;
  structure: TeamStructure;
  viewerRole: StoredRole;
  /** The viewer is in Internal Management, who decide who is an Owner. */
  viewerIsInternalManagement: boolean;
  onClose: () => void;
  /** Called after any change lands, so the page can reload the tree. */
  onChanged: () => Promise<void> | void;
  /** Hands off to the page's remove-member confirmation. */
  onRemove: (uid: string) => void;
}

export function ManageMemberDialog({
  member,
  structure,
  viewerRole,
  viewerIsInternalManagement,
  onClose,
  onChanged,
  onRemove,
}: ManageMemberDialogProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A fresh dialog per person: no stale error or half-made confirmation.
  useEffect(() => {
    setError(null);
    setBusy(null);
  }, [member?.id]);

  if (!member) return null;

  const name = memberDisplayName(member);
  const isOwner = member.role === "OWNER";
  const department = structure.departments.find((d) => d.id === member.departmentId) ?? null;
  const isLead = department?.leadId === member.id;
  const rank = rankOf(member.role, isLead);

  const viewerIsOwner = viewerRole === "OWNER";
  // The picker offers ranks below the viewer, to people below the viewer.
  const rankOptions: AssignableRank[] =
    structure.assignableRanks.length > 0 &&
    !isOwner &&
    rankLevel(normaliseRole(member.role)) < rankLevel(viewerRole)
      ? [...structure.assignableRanks, "MEMBER"]
      : [];
  const showDepartment = !isOwner && structure.viewerCanAppointLeads;

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
          leading={<UserAvatar photoURL={member.photoURL} name={member.name} size="lg" rank={rank} uid={member.id} />}
          title={<span className="block truncate">{name}</span>}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full bg-surface-control px-2 py-0.5 text-[11px] font-normal ring-1 ring-inset ring-line/[0.08]",
                  rank === "MEMBER" ? "text-ink-muted" : RANK_TEXT[rank]
                )}
              >
                {isOwner && <Crown className="h-3 w-3" aria-hidden />}
                {rank === "TEAM_LEAD" && department ? department.leadTitle : RANK_LABEL[rank]}
              </span>
              {!isOwner && <span className="truncate">{department ? department.name : "No department"}</span>}
            </span>
          }
        />

        <div className="space-y-3">
          {error && <DialogNotice tone="red">{error}</DialogNotice>}

          {/* Rank: Executive, Manager or Member. Owner has its own section. */}
          {rankOptions.length > 0 && (
            <section className={SECTION_CLASS}>
              <h4 className={SECTION_LABEL_CLASS}>
                <Award className="h-3.5 w-3.5" aria-hidden />
                Rank
              </h4>
              <div className="grid gap-2" role="radiogroup" aria-label={`${name}'s rank`}>
                {rankOptions.map((option) => {
                  const selected = normaliseRole(member.role) === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={busy !== null || selected}
                      onClick={() =>
                        run(`rank-${option}`, () => setMemberRankAction({ targetUid: member.id, rank: option }))
                      }
                      className={cn(
                        "flex flex-col items-start gap-0.5 rounded-xl px-3.5 py-2.5 text-left ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default",
                        selected
                          ? "bg-surface-control ring-line/[0.14]"
                          : "ring-line/[0.06] hover:bg-surface-hover/60 disabled:opacity-60"
                      )}
                    >
                      <span className={cn("text-[13px]", option === "MEMBER" ? "text-ink" : RANK_TEXT[option])}>
                        {busy === `rank-${option}` ? "Saving…" : RANK_LABEL[option]}
                        {selected && <span className="text-ink-dim"> · current</span>}
                      </span>
                      <span className="text-[12px] leading-relaxed text-ink-dim">{RANK_HINT[option]}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Department: members only. Owners sit above departments. */}
          {showDepartment && (
            <section className={SECTION_CLASS}>
              <h4 className={SECTION_LABEL_CLASS}>
                <Network className="h-3.5 w-3.5" aria-hidden />
                Department
              </h4>
              {/* Who is in which department is arranged on the chart in Admin Tools. */}
              <p className="text-[13px] text-ink-muted">
                {department ? department.name : "Not in a department"}
                <span className="block text-[12px] text-ink-dim">Departments are arranged in Admin Tools.</span>
              </p>

              {department && structure.viewerCanAppointLeads && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy !== null}
                  isLoading={busy === "lead"}
                  onClick={() =>
                    run("lead", async () => {
                      const result = await setDepartmentLeadAction({
                        departmentId: department.id,
                        memberUid: isLead ? null : member.id,
                      });
                      // Their Team Lead halo changes everywhere else too.
                      if (result.success) invalidateTeamLeads();
                      return result;
                    })
                  }
                >
                  {isLead
                    ? `Remove as ${department.leadTitle.toLowerCase()}`
                    : `Make ${department.leadTitle.toLowerCase()} of ${department.name}`}
                </Button>
              )}
            </section>
          )}

          {/* Owners are changed in Admin Tools, behind its passcode. */}
          {viewerIsInternalManagement && (
            <section className={SECTION_CLASS}>
              <h4 className={SECTION_LABEL_CLASS}>
                <Crown className="h-3.5 w-3.5" aria-hidden />
                Ownership
              </h4>
              <p className="text-[13px] leading-relaxed text-ink-muted">
                {isOwner ? "Taking away" : "Giving"} the Owner rank happens in Admin Tools, where you&apos;ll
                need the Admin Tools passcode.
              </p>
              <Link
                href="/admin"
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-surface-control text-[13px] text-ink ring-1 ring-inset ring-line/[0.06] transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <KeyRound className="h-3.5 w-3.5" aria-hidden />
                Open Admin Tools
              </Link>
            </section>
          )}

          {/* Any owner can remove a member; only Internal Management can remove an owner. */}
          {viewerIsOwner && (!isOwner || viewerIsInternalManagement) && (
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
