"use client";

import type { WiredTree } from "@/lib/members/wired-tree";
import type { Department } from "@/types/department";
import type { Member } from "@/types/member";

import { OrgTreeConnectors, type Branch } from "./org-tree-connectors";
import { OrgTreeDepartmentCard, OrgTreeUnassignedBucket } from "./org-tree-department-card";
import { EXECUTIVE_CARD_WIDTH, OrgTreeOwnerCard, OWNER_CARD_WIDTH } from "./org-tree-owner-card";
import type { TreeNodeContext } from "./org-tree-person";

/* ------------------------------------------------------------------ */
/*  Org tree: the Tree view on /teams                                  */
/*                                                                     */
/*    owner          owner          owner      one row of equals       */
/*      ●              │                                               */
/*    exec             │                       Executives under owners */
/*      ●              ●                                               */
/*    ╭─┴──╮           │                                               */
/*    dept dept       dept                     each under its card     */
/*                                                                     */
/*  It mirrors the chart Internal Management wires in Admin Tools,     */
/*  through `buildWiredTree`; nothing here decides structure. A        */
/*  department wired straight to an Owner while Executives exist gets  */
/*  a line down through the Executive row, so it still reads as        */
/*  hanging from that Owner. Unwired departments and the "not in a     */
/*  department" bucket hang from one shared node, like the old tree.   */
/*                                                                     */
/*  Desktop: a fixed-width diagram (260px columns, 48px gutters)       */
/*  centred on the page, scrolling sideways rather than squeezing the  */
/*  cards; fixed widths let every line be drawn by arithmetic. Phones  */
/*  get one stacked column.                                            */
/* ------------------------------------------------------------------ */

const COLUMN = 260;
const GUTTER = 48;
const OWNER_GAP = 24;
const BAND_HEIGHT = 112;
/** The Executive row's height: a card, top-aligned, with room under it. */
const EXECUTIVE_ROW_HEIGHT = 108;

interface OrgTreeProps extends TreeNodeContext {
  tree: WiredTree<Member, Department>;
  /** The viewer's own id when they are in Internal Management, otherwise null. */
  selfInInternalManagement: string | null;
  /** The viewer can open the Manage dialog on people in departments. */
  canManagePeople: boolean;
  /** The viewer is in Internal Management: Owners open the Manage dialog too. */
  canManageOwners: boolean;
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

/** Centres of `count` items of `size`, `gap` apart, centred in `width`. */
function centres(count: number, size: number, gap: number, width: number): number[] {
  const total = count * size + Math.max(0, count - 1) * gap;
  const start = (width - total) / 2;
  return Array.from({ length: count }, (_, i) => start + i * (size + gap) + size / 2);
}

export function OrgTree({
  tree,
  selfInInternalManagement,
  canManagePeople,
  canManageOwners,
  departmentLimit,
  ...context
}: OrgTreeProps) {
  const { owners, executives, departments, unassigned } = tree;
  const hasDepartments = departments.length > 0;
  const hasUnassigned = unassigned.length > 0;
  const hasExecutives = executives.length > 0;

  const columnCount = (hasDepartments ? departments.length : 1) + (hasUnassigned ? 1 : 0);
  const width = Math.max(
    columnCount * COLUMN + (columnCount - 1) * GUTTER,
    owners.length * OWNER_CARD_WIDTH + Math.max(0, owners.length - 1) * OWNER_GAP,
    executives.length * EXECUTIVE_CARD_WIDTH + Math.max(0, executives.length - 1) * OWNER_GAP
  );

  const ownerX = new Map(
    centres(owners.length, OWNER_CARD_WIDTH, OWNER_GAP, width).map((x, i) => [owners[i].id, x])
  );
  const executiveXs = centres(executives.length, EXECUTIVE_CARD_WIDTH, OWNER_GAP, width);
  const executiveX = new Map(executives.map((e, i) => [e.person.id, executiveXs[i]]));
  const columnXs = centres(columnCount, COLUMN, GUTTER, width);

  // Owners → their Executives.
  const executiveBranches: Branch[] = [];
  for (const owner of owners) {
    const toX = executives.filter((e) => e.ownerId === owner.id).map((e) => executiveX.get(e.person.id)!);
    if (toX.length > 0) executiveBranches.push({ fromX: ownerX.get(owner.id)!, toX });
  }

  // Executives or Owners → their departments; the rest from a shared node.
  const fromCard = new Map<number, number[]>();
  const shared: { x: number; dashed: boolean }[] = [];
  if (hasDepartments) {
    departments.forEach((column, i) => {
      const from = column.bossId ? (executiveX.get(column.bossId) ?? ownerX.get(column.bossId)) : undefined;
      if (from === undefined) shared.push({ x: columnXs[i], dashed: false });
      else fromCard.set(from, [...(fromCard.get(from) ?? []), columnXs[i]]);
    });
  } else {
    shared.push({ x: columnXs[0], dashed: false });
  }
  if (hasUnassigned) shared.push({ x: columnXs[columnCount - 1], dashed: true });

  const departmentBranches: Branch[] = [...fromCard].map(([fromX, toX]) => ({ fromX, toX }));
  if (shared.length > 0) {
    departmentBranches.push({ fromX: width / 2, toX: shared.map((s) => s.x), dashed: shared.map((s) => s.dashed) });
  }

  // Owners whose departments hang straight from them, past the Executive row.
  const passThrough = hasExecutives
    ? owners.filter((o) => fromCard.has(ownerX.get(o.id)!)).map((o) => ownerX.get(o.id)!)
    : [];
  // ...which starts in the band above that row, straight down.
  for (const x of passThrough) {
    const branch = executiveBranches.find((b) => b.fromX === x);
    if (branch) branch.toX.push(x);
    else executiveBranches.push({ fromX: x, toX: [x] });
  }

  const ownerCards = owners.map((owner) => (
    <OrgTreeOwnerCard
      key={owner.id}
      member={owner}
      inInternalManagement={owner.id === selfInInternalManagement}
      context={context}
      manageable={canManageOwners && owner.id !== context.viewerId}
    />
  ));

  const executiveCard = (person: Member) => (
    <OrgTreeOwnerCard
      key={person.id}
      member={person}
      rank="EXECUTIVE"
      inInternalManagement={person.id === selfInInternalManagement}
      context={context}
      manageable={canManagePeople && person.id !== context.viewerId}
    />
  );

  const columns = (
    <>
      {hasDepartments ? (
        departments.map((column) => (
          <OrgTreeDepartmentCard
            key={column.department.id}
            column={column}
            context={context}
            canManagePeople={canManagePeople}
          />
        ))
      ) : (
        <NoDepartments available={departmentLimit > 0} />
      )}

      {hasUnassigned && (
        <OrgTreeUnassignedBucket
          members={unassigned}
          title={hasDepartments ? "Not in a department" : "Members"}
          context={context}
          canManage={canManagePeople}
        />
      )}
    </>
  );

  return (
    <>
      {/* Phones: one full-width column, top down. */}
      <div className="flex flex-col pb-6 sm:hidden">
        <div className="flex flex-col gap-3">{ownerCards}</div>
        {hasExecutives && (
          <>
            <Stem />
            <div className="flex flex-col gap-3">{executives.map((e) => executiveCard(e.person))}</div>
          </>
        )}
        <Stem />
        <div className="flex flex-col gap-4">{columns}</div>
      </div>

      <div className="hidden overflow-x-auto pb-6 sm:block">
        <div className="mx-auto px-12" style={{ width: width + GUTTER * 2 }}>
          <div className="flex justify-center" style={{ gap: OWNER_GAP }}>
            {ownerCards}
          </div>

          {hasExecutives && (
            <>
              <OrgTreeConnectors width={width} height={BAND_HEIGHT} branches={executiveBranches} />
              <div className="relative" style={{ width, height: EXECUTIVE_ROW_HEIGHT }}>
                {passThrough.map((x) => (
                  <span
                    key={x}
                    aria-hidden
                    className="absolute top-0 h-full w-[1.5px] bg-line/[0.16]"
                    style={{ left: x - 0.75 }}
                  />
                ))}
                {executives.map((e) => (
                  <div
                    key={e.person.id}
                    className="absolute top-0"
                    style={{ left: executiveX.get(e.person.id)! - EXECUTIVE_CARD_WIDTH / 2 }}
                  >
                    {executiveCard(e.person)}
                  </div>
                ))}
              </div>
            </>
          )}

          <OrgTreeConnectors width={width} height={BAND_HEIGHT} branches={departmentBranches} />

          <div className="flex items-start justify-center" style={{ gap: GUTTER }}>
            {columns}
          </div>
        </div>
      </div>
    </>
  );
}

function Stem() {
  return (
    <div aria-hidden className="mx-auto my-2 flex flex-col items-center">
      <span className="h-8 w-[1.5px] bg-line/[0.16]" />
      <span className="h-1.5 w-1.5 rounded-full bg-orbit-gold" />
      <span className="h-8 w-[1.5px] bg-line/[0.16]" />
    </div>
  );
}
