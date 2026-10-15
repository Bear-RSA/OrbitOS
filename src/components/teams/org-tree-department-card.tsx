"use client";

import { Pencil, Trash2 } from "lucide-react";

import { InteractiveCard } from "@/components/ui/interactive-card";
import type { DepartmentBranch } from "@/lib/members/hierarchy";
import type { Department } from "@/types/department";
import type { Member } from "@/types/member";

import { CountPill, Eyebrow, PersonRow, type TreeNodeContext } from "./org-tree-person";

/* ------------------------------------------------------------------ */
/*  Department card and the unassigned bucket                          */
/*                                                                     */
/*  The lead row keeps its height when there is no lead, so cards      */
/*  standing side by side line their member lists up.                  */
/* ------------------------------------------------------------------ */

const iconButton =
  "relative z-10 rounded-lg p-2 text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2";

export function OrgTreeDepartmentCard({
  branch,
  context,
  canManage,
  onRename,
  onDelete,
}: {
  branch: DepartmentBranch<Member>;
  context: TreeNodeContext;
  canManage: boolean;
  onRename: (department: Department) => void;
  onDelete: (department: Department) => void;
}) {
  const { department, lead, members } = branch;
  const count = members.length + (lead ? 1 : 0);

  return (
    <InteractiveCard surface="fog" className="w-[260px] rounded-3xl p-6">
      {/* InteractiveCard wraps its children in one div, so the stack lives here. */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-light tracking-tight text-ink">
            {department.name}
          </h3>
          <CountPill value={count} label={`${count} ${count === 1 ? "person" : "people"}`} />
          {canManage && (
            <div className="-mr-2 flex items-center">
              <button
                type="button"
                onClick={() => onRename(department)}
                aria-label={`Rename ${department.name}`}
                className={`${iconButton} hover:bg-surface-hover hover:text-ink focus-visible:ring-focus`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(department)}
                aria-label={`Delete ${department.name}`}
                className={`${iconButton} hover:bg-orbit-red/10 hover:text-orbit-red focus-visible:ring-orbit-red/50`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Eyebrow>{department.leadTitle}</Eyebrow>
          {lead ? (
            <PersonRow member={lead} tier="lead" context={context} manageable={canManage} />
          ) : (
            <div className="flex items-center gap-3 p-1">
              <span className="h-10 w-10 shrink-0 rounded-full border border-dashed border-line/[0.2]" aria-hidden />
              <span className="truncate text-[13px] italic text-ink-faint">
                No {department.leadTitle.toLowerCase()} assigned
              </span>
            </div>
          )}
        </div>

        {members.length > 0 ? (
          <div className="space-y-1 border-t border-line/[0.06] pt-4">
            {members.map((member) => (
              <PersonRow
                key={member.id}
                member={member}
                tier="member"
                context={context}
                manageable={canManage}
              />
            ))}
          </div>
        ) : (
          !lead && <p className="text-[12px] text-ink-dim">No members yet</p>
        )}
      </div>
    </InteractiveCard>
  );
}

/** Members filed in no department: a "not yet placed" terminal, not a real branch. */
export function OrgTreeUnassignedBucket({
  members,
  title,
  context,
  canManage,
}: {
  members: Member[];
  title: string;
  context: TreeNodeContext;
  canManage: boolean;
}) {
  return (
    <div className="flex w-[260px] flex-col gap-4 rounded-3xl border border-dashed border-line/[0.14] bg-surface-sunken/30 p-6">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-light tracking-tight text-ink-dim">{title}</h3>
        <CountPill value={members.length} label={`${members.length} unplaced`} />
      </div>
      <div className="space-y-1">
        {members.map((member) => (
          <PersonRow
            key={member.id}
            member={member}
            tier="member"
            context={context}
            manageable={canManage}
            muted
          />
        ))}
      </div>
    </div>
  );
}
