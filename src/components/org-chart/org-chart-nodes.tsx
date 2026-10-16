"use client";

import { createContext, memo, useContext } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  Position,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Pencil, Settings2, Trash2, X } from "lucide-react";

import type { ChartDepartment, ChartPerson } from "@/app/actions/org-chart";
import { departmentShade, DepartmentGlass, DepartmentIcon } from "@/components/ui/department-glass";
import type { DepartmentTint } from "@/lib/members/department-tint";
import { UserAvatar } from "@/components/ui/user-avatar";
import { RANK_LABEL, rankOf } from "@/lib/members/rank";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  The cards and wires on the org chart                               */
/*                                                                     */
/*  Every card has a plug on top (its boss) and one underneath (who    */
/*  is under it); an Owner has only the one underneath. A Member's     */
/*  card has an × that sends them back to the Members list.            */
/*  Everything a card can do goes through `ChartActions`, so the cards */
/*  stay the same objects on reload.                                   */
/* ------------------------------------------------------------------ */

/** Dragged from the Members list, dropped anywhere on the canvas. */
export const PERSON_DRAG_TYPE = "application/x-orbit-person";

export interface ChartActions {
  editable: boolean;
  viewerId: string;
  /** Opens the Manage dialog on Teams. Absent in Admin Tools. */
  canManage: (person: ChartPerson) => boolean;
  onOpenProfile: (uid: string) => void;
  onManage?: (uid: string) => void;
  /** Sends a member's card back to the Members list. */
  onRemoveFromCanvas: (uid: string) => void;
  onRenameDepartment: (department: ChartDepartment) => void;
  onDeleteDepartment: (department: ChartDepartment) => void;
  /** Takes a card off its boss, by node id. */
  onDisconnect: (childId: string) => void;
}

export const ChartActionsContext = createContext<ChartActions | null>(null);

function useActions(): ChartActions {
  const actions = useContext(ChartActionsContext);
  if (!actions) throw new Error("Chart cards need ChartActionsContext.");
  return actions;
}

/** `reportsTo` comes ready to show from `layOutChart`; null for Owners. */
export type PersonNode = Node<{ person: ChartPerson; reportsTo: string | null; tint: DepartmentTint | null }, "person">;

export interface DepartmentCounts {
  managers: number;
  teamLeads: number;
  members: number;
  /** Everyone under it, at any rank. */
  total: number;
}

export type DepartmentNode = Node<{ department: ChartDepartment; counts: DepartmentCounts; head: ChartPerson | null }, "department">;

const PLUG = "!h-3 !w-3";

/* ---- Person card -------------------------------------------------- */

export const PersonCard = memo(function PersonCard({ data }: NodeProps<PersonNode>) {
  const actions = useActions();
  const { person, reportsTo, tint } = data;
  const rank = rankOf(person.role, false);
  // Everyone in a department wears a lighter shade of its colour.
  const shade = departmentShade(tint);

  return (
    <div
      style={shade.style}
      className={cn("w-[200px] rounded-[20px] bg-surface-control p-3 ring-1 ring-inset ring-line/[0.08]", shade.className)}
    >
      {person.role !== "OWNER" && <Handle type="target" position={Position.Top} className={PLUG} isConnectable={actions.editable} />}

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => actions.onOpenProfile(person.id)}
          className="nodrag flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          aria-label={`View ${person.name}`}
        >
          <UserAvatar photoURL={person.photoURL} name={person.name} size="md" rank={rank} uid={person.id} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-ink">
              {person.name}
              {person.id === actions.viewerId && <span className="text-ink-dim"> · You</span>}
            </span>
            {/* The halo carries the rank; the word stays for screen readers. Matches Teams. */}
            <span className="sr-only">{RANK_LABEL[rank]}</span>
          </span>
        </button>
        {actions.editable && person.role === "MEMBER" && (
          <IconButton label={`Take ${person.name} off the chart`} onClick={() => actions.onRemoveFromCanvas(person.id)}>
            <X className="h-3 w-3" />
          </IconButton>
        )}
        {!actions.editable && actions.onManage && actions.canManage(person) && (
          <IconButton label={`Manage ${person.name}`} onClick={() => actions.onManage?.(person.id)}>
            <Settings2 className="h-3 w-3" />
          </IconButton>
        )}
      </div>

      {reportsTo && (
        <p className="mt-2 truncate border-t border-line/[0.06] pt-2 text-[11px] text-ink-dim" title={reportsTo}>
          {reportsTo}
        </p>
      )}

      <Handle type="source" position={Position.Bottom} className={PLUG} isConnectable={actions.editable} />
    </div>
  );
});

/* ---- Department card ---------------------------------------------- */

export const DepartmentCard = memo(function DepartmentCard({ data }: NodeProps<DepartmentNode>) {
  const actions = useActions();
  const { department, counts, head } = data;

  // Only counts above zero: no "0 Managers" chips. Matches Teams.
  const stats: { label: string; value: number }[] = [
    { label: counts.managers === 1 ? "Manager" : "Managers", value: counts.managers },
    { label: counts.teamLeads === 1 ? "Team Lead" : "Team Leads", value: counts.teamLeads },
    { label: counts.members === 1 ? "Member" : "Members", value: counts.members },
  ].filter((s) => s.value > 0);

  return (
    <div className="relative w-[240px]">
      {/* Plugs sit outside the glass, which clips whatever overflows it. */}
      <Handle type="target" position={Position.Top} className={PLUG} isConnectable={actions.editable} />
      <DepartmentGlass tint={department.tint} className="p-4">

      <div className="flex items-start gap-3">
        <DepartmentIcon icon={department.icon} />
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="line-clamp-2 text-[15px] font-medium leading-snug tracking-tight text-ink-strong">{department.name}</h3>
          {department.description && (
            <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-ink-muted" title={department.description}>
              {department.description}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-ink-dim">
            {counts.total === 0 ? "Nobody in it yet" : `${counts.total} ${counts.total === 1 ? "person" : "people"}`}
          </p>
        </div>
        {actions.editable && (
          <span className="nodrag -mr-1.5 -mt-1 flex">
            <IconButton label={`Edit ${department.name}`} onClick={() => actions.onRenameDepartment(department)}>
              <Pencil className="h-3 w-3" />
            </IconButton>
            <IconButton label={`Delete ${department.name}`} danger onClick={() => actions.onDeleteDepartment(department)}>
              <Trash2 className="h-3 w-3" />
            </IconButton>
          </span>
        )}
      </div>

      <div className="mt-3.5 flex items-center gap-2.5 rounded-[14px] bg-base/30 px-2.5 py-2 ring-1 ring-inset ring-[rgb(var(--tint)/0.18)]">
        {head ? (
          <button
            type="button"
            onClick={() => actions.onOpenProfile(head.id)}
            className="nodrag flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <UserAvatar photoURL={head.photoURL} name={head.name} size="sm" rank={rankOf(head.role, false)} uid={head.id} />
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] uppercase tracking-[0.08em] text-ink-dim">Head of department</span>
              <span className="block truncate text-[13px] text-ink">{head.name}</span>
            </span>
          </button>
        ) : (
          <span className="py-1 text-[12px] text-ink-dim">
            {actions.editable ? "No head yet: wire someone above it" : "No head yet"}
          </span>
        )}
      </div>

      {stats.length > 0 && (
        <dl className="mt-2.5 flex gap-1.5 text-center">
          {stats.map((s) => (
            <div
              key={s.label}
              className="min-w-0 flex-1 rounded-[12px] bg-[rgb(var(--tint)/0.10)] px-1 py-1.5 ring-1 ring-inset ring-[rgb(var(--tint)/0.16)]"
            >
              <dd className="font-mono text-[15px] tabular-nums text-ink-strong">{s.value}</dd>
              <dt className="truncate text-[10px] text-ink-dim">{s.label}</dt>
            </div>
          ))}
        </dl>
      )}

      </DepartmentGlass>
      <Handle type="source" position={Position.Bottom} className={PLUG} isConnectable={actions.editable} />
    </div>
  );
});
function IconButton({
  label,
  onClick,
  children,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "nodrag flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        danger ? "text-ink-faint hover:bg-orbit-red/10 hover:text-orbit-red" : "text-ink-faint hover:bg-surface-hover hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

/* ---- Wire --------------------------------------------------------- */

/** A curved wire, with an unplug button at its middle while editing. */
export function PlugEdge({
  id,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
}: EdgeProps) {
  const actions = useActions();
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={24} />
      {actions.editable && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={() => actions.onDisconnect(target)}
            aria-label="Unplug this wire"
            title="Unplug"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className={cn(
              "nodrag nopan pointer-events-auto absolute flex h-6 w-6 items-center justify-center rounded-full bg-surface-control text-ink-muted ring-1 ring-line/[0.12] transition-[opacity,transform] duration-quick hover:scale-110 hover:text-orbit-red",
              selected ? "opacity-100" : "opacity-60 hover:opacity-100 focus-visible:opacity-100"
            )}
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
