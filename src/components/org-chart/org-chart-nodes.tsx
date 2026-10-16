"use client";

import { createContext, memo, useContext, useState, type DragEvent } from "react";
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
import { ChevronDown, Network, Pencil, Settings2, Trash2, X } from "lucide-react";

import type { ChartDepartment, ChartPerson } from "@/app/actions/org-chart";
import { RANK_TEXT } from "@/components/ui/rank-styles";
import { UserAvatar } from "@/components/ui/user-avatar";
import { personNodeId } from "@/lib/members/org-chart";
import { RANK_LABEL, rankOf } from "@/lib/members/rank";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  The cards and wires on the org chart                               */
/*                                                                     */
/*  Every card has a plug on top (its boss) and one underneath (who    */
/*  is under it); an Owner has only the one underneath. Members are    */
/*  not cards: they stack on their Team Lead's or Manager's card,      */
/*  folded to a count until opened. Everything a card can do goes      */
/*  through `ChartActions`, so the cards stay the same objects on      */
/*  reload.                                                            */
/* ------------------------------------------------------------------ */

/** Dragged from the People list, dropped on a Team Lead or Manager. */
export const PERSON_DRAG_TYPE = "application/x-orbit-person";

export interface ChartActions {
  editable: boolean;
  viewerId: string;
  /** Opens the Manage dialog on Teams. Absent in Admin Tools. */
  canManage: (person: ChartPerson) => boolean;
  onOpenProfile: (uid: string) => void;
  onManage?: (uid: string) => void;
  /** Puts a member under a Team Lead or Manager. */
  onPlaceMember: (memberUid: string, bossUid: string) => void;
  onRenameDepartment: (department: ChartDepartment) => void;
  onDeleteDepartment: (department: ChartDepartment) => void;
  /** Takes a card or member off its boss, by node id. */
  onDisconnect: (childId: string) => void;
}

export const ChartActionsContext = createContext<ChartActions | null>(null);

function useActions(): ChartActions {
  const actions = useContext(ChartActionsContext);
  if (!actions) throw new Error("Chart cards need ChartActionsContext.");
  return actions;
}

export type PersonNode = Node<{ person: ChartPerson; members: ChartPerson[] }, "person">;

export interface DepartmentCounts {
  managers: number;
  teamLeads: number;
  members: number;
}

export type DepartmentNode = Node<{ department: ChartDepartment; counts: DepartmentCounts }, "department">;

const PLUG = "!h-3 !w-3";

/* ---- Person card -------------------------------------------------- */

export const PersonCard = memo(function PersonCard({ data }: NodeProps<PersonNode>) {
  const actions = useActions();
  const { person, members } = data;
  const rank = rankOf(person.role, false);
  const takesMembers = person.role === "TEAM_LEAD" || person.role === "MANAGER";
  const [open, setOpen] = useState(false);
  const [dropping, setDropping] = useState(false);

  const acceptDrag = (e: DragEvent) => {
    if (!actions.editable || !takesMembers || !e.dataTransfer.types.includes(PERSON_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropping(true);
  };

  const drop = (e: DragEvent) => {
    setDropping(false);
    const uid = e.dataTransfer.getData(PERSON_DRAG_TYPE);
    if (!actions.editable || !takesMembers || !uid) return;
    e.preventDefault();
    actions.onPlaceMember(uid, person.id);
    setOpen(true);
  };

  return (
    <div
      onDragOver={acceptDrag}
      onDragEnter={acceptDrag}
      onDragLeave={() => setDropping(false)}
      onDrop={drop}
      className={cn(
        "w-[200px] rounded-[20px] bg-surface-control p-3 ring-1 ring-inset transition-[box-shadow,transform] duration-quick ease-spring",
        dropping ? "scale-[1.03] ring-2 ring-focus" : "ring-line/[0.08]"
      )}
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
            <span className={cn("block text-[11px]", RANK_TEXT[rank])}>{RANK_LABEL[rank]}</span>
          </span>
        </button>
        {!actions.editable && actions.onManage && actions.canManage(person) && (
          <IconButton label={`Manage ${person.name}`} onClick={() => actions.onManage?.(person.id)}>
            <Settings2 className="h-3 w-3" />
          </IconButton>
        )}
      </div>

      {takesMembers && (
        <div className="mt-2.5 border-t border-line/[0.06] pt-2">
          {members.length === 0 ? (
            <p className="px-1 text-[11px] text-ink-faint">
              {actions.editable ? "Drag members here from People" : "No members"}
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="nodrag flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-[12px] text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <span className="flex -space-x-2">
                  {members.slice(0, 3).map((m) => (
                    <UserAvatar key={m.id} photoURL={m.photoURL} name={m.name} size="sm" className="ring-2 ring-surface-control" />
                  ))}
                </span>
                <span className="flex-1">
                  {members.length} member{members.length === 1 ? "" : "s"}
                </span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-quick", open && "rotate-180")} aria-hidden />
              </button>
              {open && (
                <ul className="nowheel mt-1.5 flex max-h-[240px] flex-col gap-0.5 overflow-y-auto">
                  {members.map((member) => (
                    <li key={member.id}>
                      <MemberRow person={member} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {/* A Team Lead's members stack on the card, so nothing wires below it. */}
      {person.role !== "TEAM_LEAD" && (
        <Handle type="source" position={Position.Bottom} className={PLUG} isConnectable={actions.editable} />
      )}
    </div>
  );
});

function MemberRow({ person }: { person: ChartPerson }) {
  const actions = useActions();

  return (
    <div className="nodrag nopan group/row flex items-center gap-2 rounded-lg px-1 py-1">
      <button
        type="button"
        onClick={() => actions.onOpenProfile(person.id)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <UserAvatar photoURL={person.photoURL} name={person.name} size="sm" uid={person.id} />
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
          {person.name}
          {person.id === actions.viewerId && <span className="text-ink-dim"> · You</span>}
        </span>
      </button>

      {actions.editable ? (
        <span className="flex shrink-0 opacity-60 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
          <IconButton label={`Take ${person.name} off this card`} onClick={() => actions.onDisconnect(personNodeId(person.id))}>
            <X className="h-3 w-3" />
          </IconButton>
        </span>
      ) : (
        actions.onManage &&
        actions.canManage(person) && (
          <IconButton label={`Manage ${person.name}`} onClick={() => actions.onManage?.(person.id)}>
            <Settings2 className="h-3 w-3" />
          </IconButton>
        )
      )}
    </div>
  );
}

/* ---- Department card ---------------------------------------------- */

export const DepartmentCard = memo(function DepartmentCard({ data }: NodeProps<DepartmentNode>) {
  const actions = useActions();
  const { department, counts } = data;
  const total = counts.managers + counts.teamLeads + counts.members;

  const stats: { label: string; value: number }[] = [
    { label: counts.managers === 1 ? "Manager" : "Managers", value: counts.managers },
    { label: counts.teamLeads === 1 ? "Team Lead" : "Team Leads", value: counts.teamLeads },
    { label: counts.members === 1 ? "Member" : "Members", value: counts.members },
  ];

  return (
    <div className="w-[240px] rounded-[22px] bg-surface-raised p-4 ring-1 ring-inset ring-line/[0.1]">
      <Handle type="target" position={Position.Top} className={PLUG} isConnectable={actions.editable} />

      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-sunken ring-1 ring-line/[0.06]">
          <Network className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-[14px] text-ink">{department.name}</h3>
        {actions.editable && (
          <span className="nodrag -mr-1.5 flex">
            <IconButton label={`Rename ${department.name}`} onClick={() => actions.onRenameDepartment(department)}>
              <Pencil className="h-3 w-3" />
            </IconButton>
            <IconButton label={`Delete ${department.name}`} danger onClick={() => actions.onDeleteDepartment(department)}>
              <Trash2 className="h-3 w-3" />
            </IconButton>
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-1.5 border-t border-line/[0.06] pt-3 text-center">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-surface-sunken/60 px-1 py-1.5">
            <dd className="font-mono text-[15px] tabular-nums text-ink">{s.value}</dd>
            <dt className="truncate text-[10px] text-ink-dim">{s.label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-center text-[11px] text-ink-dim">
        {total === 0 ? (actions.editable ? "Wire a Manager under it" : "Nobody in it yet") : `${total} ${total === 1 ? "person" : "people"}`}
      </p>

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
