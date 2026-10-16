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
import { Network, Pencil, Settings2, Trash2, X } from "lucide-react";

import type { ChartDepartment, ChartPerson } from "@/app/actions/org-chart";
import { RANK_TEXT } from "@/components/ui/rank-styles";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { ChartTier, DepartmentSlot } from "@/lib/members/org-chart";
import { RANK_LABEL, rankOf } from "@/lib/members/rank";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  The cards and wires on the org chart                               */
/*                                                                     */
/*  An Owner card has a plug underneath; a department card has one on  */
/*  top, so a wire always runs from the Owner down to the department.  */
/*  Inside each department card, four slots top down: Executive,       */
/*  Manager, Team Lead, members. Everything a card can do goes through */
/*  `ChartActions`, so the cards stay the same objects on reload.      */
/* ------------------------------------------------------------------ */

/** Dragged from the tray or from a department, dropped on a department. */
export const PERSON_DRAG_TYPE = "application/x-orbit-person";

export interface ChartActions {
  editable: boolean;
  viewerId: string;
  /** Opens the Manage dialog on Teams. Absent in Admin Tools. */
  canManage: (person: ChartPerson) => boolean;
  onOpenProfile: (uid: string) => void;
  onManage?: (uid: string) => void;
  onMovePerson: (uid: string, departmentId: string | null) => void;
  onSetLead: (departmentId: string, uid: string | null) => void;
  onSetSlot: (departmentId: string, slot: DepartmentSlot, uid: string | null) => void;
  /**
   * Who can be put in a slot: everyone below Owner. Someone without the
   * slot's rank is given it as they are seated.
   */
  candidates: ChartPerson[];
  onRenameDepartment: (department: ChartDepartment) => void;
  onDeleteDepartment: (department: ChartDepartment) => void;
  onDisconnect: (childId: string) => void;
}

export const ChartActionsContext = createContext<ChartActions | null>(null);

function useActions(): ChartActions {
  const actions = useContext(ChartActionsContext);
  if (!actions) throw new Error("Chart cards need ChartActionsContext.");
  return actions;
}

export type PersonNode = Node<{ person: ChartPerson; tier: ChartTier }, "person">;
export type DepartmentNode = Node<
  {
    department: ChartDepartment;
    executive: ChartPerson | null;
    manager: ChartPerson | null;
    lead: ChartPerson | null;
    members: ChartPerson[];
  },
  "department"
>;

const PLUG = "!h-3 !w-3";

/* ---- Person card -------------------------------------------------- */

export const PersonCard = memo(function PersonCard({ data }: NodeProps<PersonNode>) {
  const actions = useActions();
  const { person, tier } = data;
  const rank = rankOf(person.role, false);

  return (
    <div className="flex w-[136px] flex-col items-center text-center">
      {tier > 1 && <Handle type="target" position={Position.Top} className={PLUG} isConnectable={actions.editable} />}

      <button
        type="button"
        onClick={() => actions.onOpenProfile(person.id)}
        className={cn(
          "relative flex h-[76px] w-[76px] items-center justify-center rounded-[22px] bg-surface-control ring-1 ring-inset ring-line/[0.08]",
          "transition-transform duration-quick ease-spring hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
          actions.editable && "cursor-grab"
        )}
        aria-label={`View ${person.name}`}
      >
        <UserAvatar photoURL={person.photoURL} name={person.name} size="lg" rank={rank} uid={person.id} />
        <span
          className="absolute -right-1.5 -top-1.5 rounded-full bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-ink-muted ring-1 ring-line/[0.1]"
          title={`Tier ${tier}`}
        >
          {tier}
        </span>
      </button>

      <p className="mt-2.5 w-full truncate text-[13px] text-ink">{person.name}</p>
      <p className={cn("text-[11px]", RANK_TEXT[rank])}>{RANK_LABEL[rank]}</p>
      {!actions.editable && actions.onManage && actions.canManage(person) && (
        <span className="nodrag mt-1">
          <IconButton label={`Manage ${person.name}`} onClick={() => actions.onManage?.(person.id)}>
            <Settings2 className="h-3 w-3" />
          </IconButton>
        </span>
      )}

      <Handle type="source" position={Position.Bottom} className={PLUG} isConnectable={actions.editable} />
    </div>
  );
});

/* ---- Department card ---------------------------------------------- */

const VISIBLE_MEMBERS = 8;
const NOBODY = "__nobody__";

export const DepartmentCard = memo(function DepartmentCard({ data }: NodeProps<DepartmentNode>) {
  const actions = useActions();
  const { department, executive, manager, lead, members } = data;
  const [dropping, setDropping] = useState(false);
  const inIt = lead ? [lead, ...members] : members;
  const shown = members.slice(0, VISIBLE_MEMBERS);

  const acceptDrag = (e: DragEvent) => {
    if (!actions.editable || !e.dataTransfer.types.includes(PERSON_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropping(true);
  };

  const drop = (e: DragEvent) => {
    setDropping(false);
    const uid = e.dataTransfer.getData(PERSON_DRAG_TYPE);
    if (!actions.editable || !uid) return;
    e.preventDefault();
    actions.onMovePerson(uid, department.id);
  };

  return (
    <div
      onDragOver={acceptDrag}
      onDragEnter={acceptDrag}
      onDragLeave={() => setDropping(false)}
      onDrop={drop}
      className={cn(
        "w-[272px] rounded-[22px] bg-surface-control p-4 ring-1 ring-inset transition-[box-shadow,transform] duration-quick ease-spring",
        dropping ? "scale-[1.02] ring-2 ring-focus" : "ring-line/[0.08]"
      )}
    >
      <Handle type="target" position={Position.Top} className={PLUG} isConnectable={actions.editable} />

      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-sunken ring-1 ring-line/[0.06]">
          <Network className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-[14px] text-ink">{department.name}</h3>
        <span className="font-mono text-[11px] tabular-nums text-ink-dim" aria-label={`${inIt.length} people`}>
          {inIt.length.toString().padStart(2, "0")}
        </span>
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

      <div className="mt-3.5 flex flex-col gap-1.5 border-t border-line/[0.06] pt-3">
        <Slot
          label="Executive"
          holder={executive}
          rank="EXECUTIVE"
          onChange={(uid) => actions.onSetSlot(department.id, "executive", uid)}
        />
        <Slot
          label="Manager"
          holder={manager}
          rank="MANAGER"
          onChange={(uid) => actions.onSetSlot(department.id, "manager", uid)}
        />
        <Slot
          label={department.leadTitle}
          holder={lead}
          rank="TEAM_LEAD"
          onChange={(uid) => actions.onSetLead(department.id, uid)}
        />
      </div>

      <div className="mt-2.5 border-t border-line/[0.06] pt-2.5">
        <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-faint">Members</p>
        {members.length === 0 ? (
          <p className="py-1 text-[12px] text-ink-dim">
            {actions.editable ? "Drag people in from the People list" : "No members yet"}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {shown.map((person) => (
              <li key={person.id}>
                <MemberRow person={person} department={department} />
              </li>
            ))}
            {members.length > shown.length && (
              <li className="px-1 pt-1 text-[12px] text-ink-dim">+{members.length - shown.length} more</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
});

/** One named seat on a department card: who holds it, and in Admin Tools a picker. */
function Slot({
  label,
  holder,
  rank,
  onChange,
}: {
  label: string;
  holder: ChartPerson | null;
  rank: "EXECUTIVE" | "MANAGER" | "TEAM_LEAD";
  onChange: (uid: string | null) => void;
}) {
  const actions = useActions();
  const options = actions.candidates;

  return (
    <div className="flex min-h-9 items-center gap-2">
      <span className={cn("w-[72px] shrink-0 truncate text-[11px] uppercase tracking-wide", RANK_TEXT[rank])}>
        {label}
      </span>

      {actions.editable ? (
        options.length === 0 && !holder ? (
          <span className="min-w-0 flex-1 text-[11px] leading-snug text-ink-faint">Nobody to choose yet. Invite people first.</span>
        ) : (
          <Select value={holder?.id ?? NOBODY} onValueChange={(value) => onChange(value === NOBODY ? null : value)}>
            <SelectTrigger
              aria-label={`${label} of this department`}
              className="nodrag nopan h-8 min-w-0 flex-1 rounded-lg px-2 text-[12px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>Nobody</SelectItem>
              {(holder && !options.some((p) => p.id === holder.id) ? [holder, ...options] : options).map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name}
                  {person.role !== rank && person.id !== holder?.id && (
                    <span className="text-ink-dim">
                      {" "}
                      · {RANK_LABEL[person.role]} → {RANK_LABEL[rank]}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      ) : holder ? (
        <button
          type="button"
          onClick={() => actions.onOpenProfile(holder.id)}
          className="nodrag flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <UserAvatar photoURL={holder.photoURL} name={holder.name} size="sm" rank={rank} uid={holder.id} />
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{holder.name}</span>
        </button>
      ) : (
        <span className="text-[12px] text-ink-faint">Nobody</span>
      )}
    </div>
  );
}

function MemberRow({ person, department }: { person: ChartPerson; department: ChartDepartment }) {
  const actions = useActions();
  const rank = rankOf(person.role, false);

  return (
    <div
      draggable={actions.editable}
      onDragStart={(e) => {
        e.dataTransfer.setData(PERSON_DRAG_TYPE, person.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "nodrag nopan group/row flex items-center gap-2 rounded-lg px-1 py-1",
        actions.editable ? "cursor-grab active:cursor-grabbing" : ""
      )}
    >
      <button
        type="button"
        onClick={() => actions.onOpenProfile(person.id)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <UserAvatar photoURL={person.photoURL} name={person.name} size="sm" rank={rank} uid={person.id} />
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
          {person.name}
          {person.id === actions.viewerId && <span className="text-ink-dim"> · You</span>}
        </span>
      </button>

      {actions.editable ? (
        <span className="flex shrink-0 opacity-60 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
          <IconButton label={`Take ${person.name} out of ${department.name}`} onClick={() => actions.onMovePerson(person.id, null)}>
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

function IconButton({
  label,
  onClick,
  children,
  danger = false,
  active = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "nodrag flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        danger
          ? "text-ink-faint hover:bg-orbit-red/10 hover:text-orbit-red"
          : active
            ? "text-orbit-teal"
            : "text-ink-faint hover:bg-surface-hover hover:text-ink"
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
