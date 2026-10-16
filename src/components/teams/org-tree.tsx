"use client";

import type { OrgTree as OrgTreeData } from "@/lib/members/hierarchy";
import type { Member } from "@/types/member";

import { OrgTreeConnectors, type Branch } from "./org-tree-connectors";
import { OrgTreeDepartmentCard, OrgTreeUnassignedBucket } from "./org-tree-department-card";
import { OrgTreeOwnerCard, OWNER_CARD_WIDTH } from "./org-tree-owner-card";
import type { TreeNodeContext } from "./org-tree-person";

/* ------------------------------------------------------------------ */
/*  Org tree: the Tree view on /teams                                  */
/*                                                                     */
/*    owner        owner        owner      one row of equals           */
/*      ●            ●                     a node under each owner     */
/*    ╭─┴──╮         │                                                 */
/*    dept dept     dept                   each under its own owner    */
/*                                                                     */
/*  Which Owner a department hangs from is wired by Internal           */
/*  Management on the chart in Admin Tools; this view only draws it.   */
/*  Columns are ordered by owner, so each owner's departments sit      */
/*  beneath them. Unwired departments and the "not in a department"    */
/*  bucket come last, hanging from one shared node.                    */
/*                                                                     */
/*  Desktop: a fixed-width diagram (260px columns, 48px gutters)       */
/*  centred on the page, scrolling sideways rather than squeezing the  */
/*  cards. Fixed widths are what let the connectors be drawn by        */
/*  arithmetic. Phones get one stacked column instead.                 */
/*                                                                     */
/*  Presentational. The page owns the data and every action.           */
/* ------------------------------------------------------------------ */

const COLUMN = 260;
const GUTTER = 48;
const OWNER_GAP = 24;
const BAND_HEIGHT = 112;

interface OrgTreeProps extends TreeNodeContext {
  tree: OrgTreeData<Member>;
  /** The viewer's own id when they are in Internal Management, otherwise null. */
  selfInInternalManagement: string | null;
  /** The viewer can open the Manage dialog on people in departments. */
  canManagePeople: boolean;
  /** The viewer is in Internal Management: owners open the Manage dialog too. */
  canManageOwners: boolean;
  /** The Owner a department is wired under in Admin Tools, or null. */
  ownerOf: (departmentId: string) => string | null;
  /** 0 when the plan does not include departments. */
  departmentLimit: number;
}

function NoDepartments({ available }: { available: boolean }) {
  return (
    <div className="flex w-full flex-col gap-4 rounded-3xl bg-surface-sunken/50 p-6 ring-1 ring-inset ring-line/[0.06] sm:w-[260px]">
      <h3 className="text-[15px] font-light tracking-tight text-ink">No departments yet</h3>
      <p className="text-[13px] font-light leading-relaxed text-ink-muted">
        {available
          ? "Internal Management builds departments in Admin Tools, and the tree fills in here."
          : "Departments are on the Pro and Custom plans."}
      </p>
    </div>
  );
}

export function OrgTree({
  tree,
  selfInInternalManagement,
  canManagePeople,
  canManageOwners,
  ownerOf,
  departmentLimit,
  ...context
}: OrgTreeProps) {
  const ownerIndex = new Map(tree.owners.map((o, i) => [o.id, i]));

  // Each owner's departments together, in owner order; unwired ones last.
  const departments = [...tree.departments].sort((a, b) => {
    const ia = ownerIndex.get(ownerOf(a.department.id) ?? "") ?? Infinity;
    const ib = ownerIndex.get(ownerOf(b.department.id) ?? "") ?? Infinity;
    return ia - ib || a.department.name.localeCompare(b.department.name);
  });

  const hasDepartments = departments.length > 0;
  const hasUnassigned = tree.unassigned.length > 0;

  // One column per department, or the empty state, then the bucket.
  const columnCount = (hasDepartments ? departments.length : 1) + (hasUnassigned ? 1 : 0);
  const columnsWidth = columnCount * COLUMN + (columnCount - 1) * GUTTER;
  const ownersWidth =
    tree.owners.length * OWNER_CARD_WIDTH + Math.max(0, tree.owners.length - 1) * OWNER_GAP;
  const width = Math.max(columnsWidth, ownersWidth);

  const columnsStart = (width - columnsWidth) / 2;
  const columnCenter = (i: number) => columnsStart + i * (COLUMN + GUTTER) + COLUMN / 2;
  const ownersStart = (width - ownersWidth) / 2;
  const ownerCenter = (i: number) => ownersStart + i * (OWNER_CARD_WIDTH + OWNER_GAP) + OWNER_CARD_WIDTH / 2;

  // Who each column hangs from: its owner's card, or the shared node.
  const branches: Branch[] = [];
  const byOwner = new Map<number, number[]>();
  const shared: { x: number; dashed: boolean }[] = [];

  if (hasDepartments) {
    departments.forEach((branch, i) => {
      const owner = ownerIndex.get(ownerOf(branch.department.id) ?? "");
      if (owner === undefined) shared.push({ x: columnCenter(i), dashed: false });
      else byOwner.set(owner, [...(byOwner.get(owner) ?? []), columnCenter(i)]);
    });
  } else {
    shared.push({ x: columnCenter(0), dashed: false });
  }
  if (hasUnassigned) shared.push({ x: columnCenter(columnCount - 1), dashed: true });

  for (const [owner, toX] of byOwner) branches.push({ fromX: ownerCenter(owner), toX });
  if (shared.length > 0) {
    branches.push({ fromX: width / 2, toX: shared.map((s) => s.x), dashed: shared.map((s) => s.dashed) });
  }

  const owners = tree.owners.map((owner) => (
    <OrgTreeOwnerCard
      key={owner.id}
      member={owner}
      inInternalManagement={owner.id === selfInInternalManagement}
      context={context}
      manageable={canManageOwners && owner.id !== context.viewerId}
    />
  ));

  const columns = (
    <>
      {hasDepartments ? (
        departments.map((branch) => (
          <OrgTreeDepartmentCard
            key={branch.department.id}
            branch={branch}
            context={context}
            canManagePeople={canManagePeople}
          />
        ))
      ) : (
        <NoDepartments available={departmentLimit > 0} />
      )}

      {hasUnassigned && (
        <OrgTreeUnassignedBucket
          members={tree.unassigned}
          title={hasDepartments ? "Not in a department" : "Members"}
          context={context}
          canManage={canManagePeople}
        />
      )}
    </>
  );

  return (
    <>
      {/* Phones: one full-width column, owners over their departments. */}
      <div className="flex flex-col pb-6 sm:hidden">
        <div className="flex flex-col gap-3">{owners}</div>
        <div aria-hidden className="mx-auto my-2 flex flex-col items-center">
          <span className="h-8 w-[1.5px] bg-line/[0.16]" />
          <span className="h-1.5 w-1.5 rounded-full bg-orbit-gold" />
          <span className="h-8 w-[1.5px] bg-line/[0.16]" />
        </div>
        <div className="flex flex-col gap-4">{columns}</div>
      </div>

      <div className="hidden overflow-x-auto pb-6 sm:block">
        <div className="mx-auto px-12" style={{ width: width + GUTTER * 2 }}>
          {/* Owner tier: one row of equals */}
          <div className="flex justify-center" style={{ gap: OWNER_GAP }}>
            {owners}
          </div>

          <OrgTreeConnectors width={width} height={BAND_HEIGHT} branches={branches} />

          {/* Columns */}
          <div className="flex items-start justify-center" style={{ gap: GUTTER }}>
            {columns}
          </div>
        </div>
      </div>
    </>
  );
}
