"use client";

import { FolderPlus } from "lucide-react";

import type { OrgTree as OrgTreeData } from "@/lib/members/hierarchy";
import type { Department } from "@/types/department";
import type { Member } from "@/types/member";

import { OrgTreeConnectors } from "./org-tree-connectors";
import { OrgTreeDepartmentCard, OrgTreeUnassignedBucket } from "./org-tree-department-card";
import { OrgTreeOwnerCard, OWNER_CARD_WIDTH } from "./org-tree-owner-card";
import type { TreeNodeContext } from "./org-tree-person";

/* ------------------------------------------------------------------ */
/*  Org tree: the Tree view on /teams                                  */
/*                                                                     */
/*    owner   owner   owner     one row of equals                      */
/*        ●   branch node                                              */
/*    ╭───┼────────╮                                                   */
/*    dept  dept   not in a department                                 */
/*                                                                     */
/*  Desktop: the diagram is a fixed width (260px columns, 48px        */
/*  gutters) centred on the page, and its wrapper scrolls sideways     */
/*  below that width rather than squeezing the cards illegible. Fixed  */
/*  columns are also what let the connectors be drawn by arithmetic.   */
/*  Phones get one stacked column instead.                             */
/*                                                                     */
/*  Presentational. The page owns the data and every action.           */
/* ------------------------------------------------------------------ */

const COLUMN = 260;
const GUTTER = 48;
const OWNER_GAP = 24;
const BAND_HEIGHT = 112;

interface OrgTreeProps extends TreeNodeContext {
  tree: OrgTreeData<Member>;
  /** Set only on the account holder's own screen. */
  accountHolderId: string | null;
  /** The viewer is an owner: departments and members can be managed. */
  canManageDepartments: boolean;
  /** The viewer is the account holder: other owners can be managed too. */
  canManageOwners: boolean;
  /** 0 when the plan does not include departments. */
  departmentLimit: number;
  onCreateDepartment: () => void;
  onRenameDepartment: (department: Department) => void;
  onDeleteDepartment: (department: Department) => void;
}

function NoDepartments({
  canCreate,
  available,
  onCreate,
}: {
  canCreate: boolean;
  available: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-4 rounded-3xl bg-surface-sunken/50 p-6 ring-1 ring-inset ring-line/[0.06] sm:w-[260px]">
      <h3 className="text-[15px] font-light tracking-tight text-ink">No departments yet</h3>
      <p className="text-[13px] font-light leading-relaxed text-ink-muted">
        {!available
          ? "Departments are on the Pro and Custom plans."
          : canCreate
            ? "Group people under a lead, and the tree fills in beneath you."
            : "An owner can group people into departments."}
      </p>
      {canCreate && available && (
        <button
          type="button"
          onClick={onCreate}
          className="flex h-10 items-center justify-center gap-2.5 rounded-lg bg-surface-control px-5 text-[13px] font-bold tracking-tight text-ink transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <FolderPlus className="h-4 w-4" />
          New department
        </button>
      )}
    </div>
  );
}

export function OrgTree({
  tree,
  accountHolderId,
  canManageDepartments,
  canManageOwners,
  departmentLimit,
  onCreateDepartment,
  onRenameDepartment,
  onDeleteDepartment,
  ...context
}: OrgTreeProps) {
  const hasDepartments = tree.departments.length > 0;
  const hasUnassigned = tree.unassigned.length > 0;

  // One column per department, or the invitation to make one, then the
  // unassigned bucket when somebody is in it.
  const columnCount = (hasDepartments ? tree.departments.length : 1) + (hasUnassigned ? 1 : 0);
  const columnsWidth = columnCount * COLUMN + (columnCount - 1) * GUTTER;
  const ownersWidth =
    tree.owners.length * OWNER_CARD_WIDTH + Math.max(0, tree.owners.length - 1) * OWNER_GAP;
  const width = Math.max(columnsWidth, ownersWidth);

  const offset = (width - columnsWidth) / 2;
  const columnCenters = Array.from(
    { length: columnCount },
    (_, i) => offset + i * (COLUMN + GUTTER) + COLUMN / 2
  );

  const owners = tree.owners.map((owner) => (
    <OrgTreeOwnerCard
      key={owner.id}
      member={owner}
      isAccountHolder={owner.id === accountHolderId}
      context={context}
      manageable={canManageOwners && owner.id !== context.viewerId}
    />
  ));

  const columns = (
    <>
      {hasDepartments ? (
        tree.departments.map((branch) => (
          <OrgTreeDepartmentCard
            key={branch.department.id}
            branch={branch}
            context={context}
            canManage={canManageDepartments}
            onRename={onRenameDepartment}
            onDelete={onDeleteDepartment}
          />
        ))
      ) : (
        <NoDepartments
          canCreate={canManageDepartments}
          available={departmentLimit > 0}
          onCreate={onCreateDepartment}
        />
      )}

      {hasUnassigned && (
        <OrgTreeUnassignedBucket
          members={tree.unassigned}
          title={hasDepartments ? "Not in a department" : "Members"}
          context={context}
          canManage={canManageDepartments}
        />
      )}
    </>
  );

  return (
    <>
      {/* Phones: the diagram is wider than the screen and opened scrolled
          to its left edge, with the owner card cut off on the right. One
          full-width column instead, owners over their departments. */}
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

          <OrgTreeConnectors
            width={width}
            height={BAND_HEIGHT}
            columnCenters={columnCenters}
            dashedFrom={hasUnassigned ? columnCount - 1 : -1}
          />

          {/* Columns */}
          <div className="flex items-start justify-center" style={{ gap: GUTTER }}>
            {columns}
          </div>
        </div>
      </div>
    </>
  );
}
