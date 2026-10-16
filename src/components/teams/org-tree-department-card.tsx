"use client";

import { InteractiveCard } from "@/components/ui/interactive-card";
import type { DepartmentColumn } from "@/lib/members/wired-tree";
import type { Department } from "@/types/department";
import type { Member } from "@/types/member";

import { CountPill, Eyebrow, PersonRow, type TreeNodeContext } from "./org-tree-person";

/* ------------------------------------------------------------------ */
/*  Department card and the unassigned bucket                          */
/*                                                                     */
/*  A department card shows what Internal Management wired under it on */
/*  the chart: each Manager, the Team Leads under them, and the people */
/*  under those. People filed here before the chart was wired are      */
/*  listed at the bottom. Departments are created and changed in Admin */
/*  Tools, so there are no edit buttons here.                          */
/* ------------------------------------------------------------------ */

export function OrgTreeDepartmentCard({
  column,
  context,
  canManagePeople,
}: {
  column: DepartmentColumn<Member, Department>;
  context: TreeNodeContext;
  /** Open the Manage dialog on the people in it. */
  canManagePeople: boolean;
}) {
  const { department, managers, filed, count } = column;
  const manageable = (member: Member) => canManagePeople && member.id !== context.viewerId;
  const row = (member: Member, tier: "lead" | "member" = "member") => (
    <PersonRow key={member.id} member={member} tier={tier} context={context} manageable={manageable(member)} />
  );

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

        {managers.length === 0 && filed.length === 0 && (
          <p className="text-[12px] text-ink-dim">No one wired in yet</p>
        )}

        {/* Each Manager, the Team Leads under them, and the people under those. */}
        {managers.map(({ manager, leads, members }) => (
          <div key={manager.id} className="space-y-2">
            <Eyebrow className="text-orbit-blue">Manager</Eyebrow>
            {row(manager, "lead")}

            {(leads.length > 0 || members.length > 0) && (
              <div className="ml-4 space-y-3 border-l border-line/[0.08] pl-3">
                {leads.map(({ lead, members: team }) => (
                  <div key={lead.id} className="space-y-1">
                    <Eyebrow className="text-orbit-teal">{department.leadTitle}</Eyebrow>
                    {row(lead)}
                    {team.length > 0 && (
                      <div className="ml-3 space-y-0.5 border-l border-line/[0.06] pl-2.5">{team.map((m) => row(m))}</div>
                    )}
                  </div>
                ))}
                {members.length > 0 && <div className="space-y-0.5">{members.map((m) => row(m))}</div>}
              </div>
            )}
          </div>
        ))}

        {/* Filed here before the chart was wired. */}
        {filed.length > 0 && (
          <div className={managers.length > 0 ? "space-y-1 border-t border-line/[0.06] pt-4" : "space-y-1"}>
            <Eyebrow>Members</Eyebrow>
            {filed.map((m) => row(m))}
          </div>
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
