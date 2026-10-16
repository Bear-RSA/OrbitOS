"use client";

import { InteractiveCard } from "@/components/ui/interactive-card";
import type { DepartmentBranch } from "@/lib/members/hierarchy";
import type { Member } from "@/types/member";

import { CountPill, Eyebrow, PersonRow, type TreeNodeContext } from "./org-tree-person";

/* ------------------------------------------------------------------ */
/*  Department card and the unassigned bucket                          */
/*                                                                     */
/*  Top down: the Executive and Manager over the department when       */
/*  Internal Management has named them, then the lead, then members.   */
/*  The lead row keeps its height when there is no lead, so cards      */
/*  standing side by side line their member lists up. Departments are  */
/*  created and changed in Admin Tools, so there are no edit buttons.  */
/* ------------------------------------------------------------------ */

export function OrgTreeDepartmentCard({
  branch,
  context,
  canManagePeople,
}: {
  branch: DepartmentBranch<Member>;
  context: TreeNodeContext;
  /** Open the Manage dialog on the people in it. */
  canManagePeople: boolean;
}) {
  const { department, lead } = branch;
  const executive = department.executiveId ? context.personById(department.executiveId) : undefined;
  const manager = department.managerId ? context.personById(department.managerId) : undefined;
  // Someone named over the department shows there, not again in the list.
  const members = branch.members.filter((m) => m.id !== executive?.id && m.id !== manager?.id);
  const count = members.length + (lead ? 1 : 0);
  const manageable = (member: Member) => canManagePeople && member.id !== context.viewerId;

  return (
    <InteractiveCard surface="fog" className="w-full rounded-3xl p-6 sm:w-[260px]">
      {/* InteractiveCard wraps its children in one div, so the stack lives here. */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-light tracking-tight text-ink">
            {department.name}
          </h3>
          <CountPill value={count} label={`${count} ${count === 1 ? "person" : "people"}`} />
        </div>

        {/* Over the department, when Internal Management has named them. */}
        {(executive || manager) && (
          <div className="space-y-2">
            {executive && (
              <div className="space-y-1">
                <Eyebrow className="text-orbit-violet">Executive</Eyebrow>
                <PersonRow member={executive} tier="member" context={context} manageable={manageable(executive)} />
              </div>
            )}
            {manager && (
              <div className="space-y-1">
                <Eyebrow className="text-orbit-blue">Manager</Eyebrow>
                <PersonRow member={manager} tier="member" context={context} manageable={manageable(manager)} />
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Eyebrow className="text-orbit-teal">{department.leadTitle}</Eyebrow>
          {lead ? (
            <PersonRow member={lead} tier="lead" context={context} manageable={manageable(lead)} />
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
                manageable={manageable(member)}
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
    <div className="flex w-full flex-col gap-4 rounded-3xl border border-dashed border-line/[0.14] bg-surface-sunken/30 p-6 sm:w-[260px]">
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
