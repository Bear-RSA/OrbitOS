"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import { FolderPlus, Plug } from "lucide-react";

import {
  connectOrgChartAction,
  disconnectOrgChartAction,
  saveOrgChartPositionsAction,
  type ChartDepartment,
  type ChartPerson,
  type OrgChart,
} from "@/app/actions/org-chart";
import { deleteDepartmentAction } from "@/app/actions/team-structure";
import { DepartmentDialog } from "@/components/members/department-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DialogNotice } from "@/components/ui/dialog-parts";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ADMIN_LOCKED_ERROR } from "@/lib/internal-management/rules";
import {
  checkConnection,
  departmentNodeId,
  descendantsOf,
  hasCard,
  kindOfRole,
  personNodeId,
  ROW,
  startingPosition,
  type ChartNodeKind,
  type ChartPosition,
} from "@/lib/members/org-chart";
import { cn } from "@/lib/utils/classnames";
import type { Department } from "@/types/department";

import {
  ChartActionsContext,
  DepartmentCard,
  PERSON_DRAG_TYPE,
  PersonCard,
  PlugEdge,
  type ChartActions,
  type DepartmentNode,
  type PersonNode,
} from "./org-chart-nodes";

/* ------------------------------------------------------------------ */
/*  The org chart canvas                                               */
/*                                                                     */
/*  Editable in Admin Tools: drag cards anywhere, pull a wire from a   */
/*  card's bottom plug down to a lower tier's top plug, drag people    */
/*  from the tray into departments. Read-only on Teams: the same       */
/*  cards and wires, panned and zoomed but never changed.              */
/*                                                                     */
/*  Wires change optimistically and snap back if the server refuses.   */
/*  Positions save a moment after a card is dropped.                   */
/* ------------------------------------------------------------------ */

type ActionResult = { success: true } | { success: false; error: string };

const nodeTypes: NodeTypes = { person: PersonCard, department: DepartmentCard };
const edgeTypes: EdgeTypes = { plug: PlugEdge };

const POSITION_SAVE_DELAY_MS = 600;

interface OrgChartCanvasProps {
  chart: OrgChart;
  editable: boolean;
  viewerId: string;
  /** Reload the chart after something changed. */
  onChanged: () => Promise<void> | void;
  onOpenProfile: (uid: string) => void;
  /** Teams only: open the Manage dialog on someone. */
  onManage?: (uid: string) => void;
  canManage?: (person: ChartPerson) => boolean;
  /** Admin Tools only: the unlock ran out. */
  onLocked?: () => void;
}

export function OrgChartCanvas(props: OrgChartCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function kindMap(chart: OrgChart) {
  const kinds = new Map<string, ChartNodeKind>();
  for (const person of chart.people) kinds.set(personNodeId(person.id), kindOfRole(person.role));
  for (const department of chart.departments) kinds.set(departmentNodeId(department.id), "DEPARTMENT");
  return kinds;
}

function buildNodes(chart: OrgChart, parents: Record<string, string>, moved: Record<string, ChartPosition>, editable: boolean): Node[] {
  const byRow = new Map<number, number>();
  const placed = (id: string, row: number) => {
    const index = byRow.get(row) ?? 0;
    byRow.set(row, index + 1);
    return moved[id] ?? chart.positions[id] ?? startingPosition(row, index);
  };

  // Members stack on whoever they're wired under.
  const membersUnder = new Map<string, ChartPerson[]>();
  for (const person of chart.people) {
    if (person.role !== "MEMBER") continue;
    const boss = parents[personNodeId(person.id)];
    if (!boss) continue;
    const list = membersUnder.get(boss) ?? [];
    list.push(person);
    membersUnder.set(boss, list);
  }

  const people: PersonNode[] = [];
  for (const person of [...chart.people].sort((a, b) => a.name.localeCompare(b.name))) {
    const kind = kindOfRole(person.role);
    if (!hasCard(kind)) continue;
    const id = personNodeId(person.id);
    people.push({
      id,
      type: "person",
      position: placed(id, ROW[kind as keyof typeof ROW]),
      data: { person, members: (membersUnder.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name)) },
      draggable: editable,
    });
  }

  const roleOf = new Map<string, ChartPerson["role"]>(chart.people.map((p) => [personNodeId(p.id), p.role]));
  const departments: DepartmentNode[] = chart.departments.map((department) => {
    const id = departmentNodeId(department.id);
    const counts = { managers: 0, teamLeads: 0, members: 0 };
    for (const node of descendantsOf(id, parents)) {
      const role = roleOf.get(node);
      if (role === "MANAGER") counts.managers += 1;
      else if (role === "TEAM_LEAD") counts.teamLeads += 1;
      else if (role === "MEMBER") counts.members += 1;
    }
    return {
      id,
      type: "department",
      position: placed(id, ROW.DEPARTMENT),
      data: { department, counts },
      draggable: editable,
    };
  });

  return [...people, ...departments];
}

/** Wires between cards. A member's wire is drawn as their place in a card's stack instead. */
function buildEdges(parents: Record<string, string>, kinds: ReadonlyMap<string, ChartNodeKind>): Edge[] {
  return Object.entries(parents)
    .filter(([child]) => {
      const kind = kinds.get(child);
      return kind !== undefined && hasCard(kind);
    })
    .map(([child, parent]) => ({
      id: `${parent}->${child}`,
      source: parent,
      target: child,
      type: "plug",
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "rgb(var(--ink-dim))" },
    }));
}
function Canvas({ chart, editable, viewerId, onChanged, onOpenProfile, onManage, canManage, onLocked }: OrgChartCanvasProps) {
  const [error, setError] = useState<string | null>(null);
  const [parents, setParents] = useState(chart.parents);
  const [departmentDialog, setDepartmentDialog] = useState<{ open: boolean; department: Department | null }>({
    open: false,
    department: null,
  });
  const [toDelete, setToDelete] = useState<ChartDepartment | null>(null);

  // Positions dropped here but not yet saved, so a reload never snaps a card back.
  const moved = useRef<Record<string, ChartPosition>>({});
  const pending = useRef<Record<string, ChartPosition>>({});
  const saveTimer = useRef<number>(0);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(buildNodes(chart, chart.parents, moved.current, editable));

  useEffect(() => {
    setParents(chart.parents);
  }, [chart]);

  // Member stacks and department counts follow the wires, so a change to
  // either redraws the cards.
  useEffect(() => {
    setNodes(buildNodes(chart, parents, moved.current, editable));
  }, [chart, parents, editable, setNodes]);

  /* Sends any dropped positions now. Leaving the page, locking Admin Tools
     or switching to Teams inside the save delay used to cancel the timer,
     and the layout Teams drew was the one from before the drag. */
  const flushPositions = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    const batch = pending.current;
    if (Object.keys(batch).length === 0) return;
    pending.current = {};
    void saveOrgChartPositionsAction(batch).then((result) => {
      if (!result.success) console.error("[OrgChart] Could not save positions:", result.error);
    });
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushPositions();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushPositions);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushPositions);
      flushPositions();
    };
  }, [flushPositions]);

  const kinds = useMemo(() => kindMap(chart), [chart]);
  const edges = useMemo(() => buildEdges(parents, kinds), [parents, kinds]);

  /** Shows a refusal, relocks if the unlock ran out. */
  const fail = useCallback(
    (message: string) => {
      if (message === ADMIN_LOCKED_ERROR) onLocked?.();
      setError(message);
    },
    [onLocked]
  );

  const run = useCallback(
    async (action: () => Promise<ActionResult>) => {
      setError(null);
      const result = await action();
      if (!result.success) {
        fail(result.error);
        return false;
      }
      await onChanged();
      return true;
    },
    [fail, onChanged]
  );

  /* ---- Wiring ---- */

  const isValidConnection = useCallback(
    (connection: Connection | Edge) =>
      checkConnection(kinds.get(connection.source) ?? null, kinds.get(connection.target) ?? null).ok,
    [kinds]
  );

  /** Wires `child` under `parent` at once, snaps back if refused, then reloads for the new filing. */
  const connect = useCallback(
    async (parent: string, child: string) => {
      const before = parents;
      setParents({ ...parents, [child]: parent });
      setError(null);
      const result = await connectOrgChartAction({ parent, child });
      if (!result.success) {
        setParents(before);
        fail(result.error);
        return;
      }
      await onChanged();
    },
    [parents, fail, onChanged]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) void connect(connection.source, connection.target);
    },
    [connect]
  );

  const disconnect = useCallback(
    async (child: string) => {
      const before = parents;
      const next = { ...parents };
      delete next[child];
      setParents(next);
      setError(null);
      const result = await disconnectOrgChartAction({ child });
      if (!result.success) {
        setParents(before);
        fail(result.error);
        return;
      }
      await onChanged();
    },
    [parents, fail, onChanged]
  );

  /* ---- Positions ---- */

  const onNodeDragStop = useCallback(
    (_event: unknown, _node: Node, dragged: Node[]) => {
      for (const node of dragged) {
        const position = { x: Math.round(node.position.x), y: Math.round(node.position.y) };
        moved.current[node.id] = position;
        pending.current[node.id] = position;
      }
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        const batch = pending.current;
        pending.current = {};
        const result = await saveOrgChartPositionsAction(batch);
        if (!result.success) fail(result.error);
      }, POSITION_SAVE_DELAY_MS);
    },
    [fail]
  );

  /* ---- Card actions ---- */

  const actions: ChartActions = useMemo(
    () => ({
      editable,
      viewerId,
      canManage: canManage ?? (() => false),
      onOpenProfile,
      onManage,
      onPlaceMember: (memberUid, bossUid) => void connect(personNodeId(bossUid), personNodeId(memberUid)),
      onRenameDepartment: (department) =>
        setDepartmentDialog({
          open: true,
          department: { ...department, orgId: "", leadId: null, createdAt: 0 },
        }),
      onDeleteDepartment: setToDelete,
      onDisconnect: (child) => void disconnect(child),
    }),
    [editable, viewerId, canManage, onOpenProfile, onManage, connect, disconnect]
  );

  /* Members, placed or not: everyone else has a card on the chart, and
     members are dropped onto a Team Lead or Manager from here. Unplaced
     first. */
  const names = useMemo(() => new Map<string, string>(chart.people.map((p) => [personNodeId(p.id), p.name])), [chart.people]);
  const tray = useMemo(
    () =>
      chart.people
        .filter((p) => p.role === "MEMBER")
        .map((p) => ({ person: p, boss: names.get(parents[personNodeId(p.id)] ?? "") ?? null }))
        .sort((a, b) => Number(!!a.boss) - Number(!!b.boss) || a.person.name.localeCompare(b.person.name)),
    [chart.people, parents, names]
  );

  return (
    <ChartActionsContext.Provider value={actions}>
      <div className="flex flex-col gap-3">
        {editable && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[12px] text-ink-dim">
              <Plug className="h-3.5 w-3.5" aria-hidden />
              Owner → Executive → Department → Manager → Team Lead. Pull a wire from a card&apos;s bottom plug to the
              top plug of the card under it, and drag members onto a Team Lead or Manager.
            </p>
            <button
              type="button"
              onClick={() => setDepartmentDialog({ open: true, department: null })}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-surface-control px-3.5 text-[13px] text-ink ring-1 ring-inset ring-line/[0.08] transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <FolderPlus className="h-3.5 w-3.5" aria-hidden />
              New department
            </button>
          </div>
        )}

        {error && <DialogNotice tone="red">{error}</DialogNotice>}

        <div className={cn("flex flex-col gap-3", editable && "lg:flex-row")}>
          {editable && <Tray people={tray} />}

          <div
            className={cn(
              /* `flex-1` only beside the tray. Stacked in a column it would
                 override the height below, and React Flow's 100% height of
                 a box sized only by min-height comes out as zero: an empty
                 frame with no chart in it. */
              "org-chart relative w-full min-w-0 overflow-hidden rounded-[28px] bg-surface-sunken/40 ring-1 ring-inset ring-line/[0.06]",
              editable ? "h-[72vh] min-h-[520px] lg:flex-1" : "h-[64vh] min-h-[440px]"
            )}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onConnect={onConnect}
              onNodeDragStop={onNodeDragStop}
              isValidConnection={isValidConnection}
              nodesDraggable={editable}
              nodesConnectable={editable}
              elementsSelectable={editable}
              edgesFocusable={editable}
              deleteKeyCode={null}
              // Read-only on Teams sits in a scrolling page: the wheel scrolls
              // the page, a drag pans the chart.
              zoomOnScroll={editable}
              preventScrolling={editable}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
              minZoom={0.3}
              maxZoom={1.6}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} />
              <Controls showInteractive={false} position="bottom-right" />
            </ReactFlow>
          </div>
        </div>
      </div>

      {editable && (
        <>
          <DepartmentDialog
            open={departmentDialog.open}
            department={departmentDialog.department}
            onClose={() => setDepartmentDialog({ open: false, department: null })}
            onSaved={onChanged}
          />
          <ConfirmDialog
            open={!!toDelete}
            onOpenChange={(open) => !open && setToDelete(null)}
            title={`Delete ${toDelete?.name ?? "department"}?`}
            description="The people under it stay in the workspace, wired to their Managers, but out of every department."
            confirmText="Delete department"
            variant="destructive"
            onConfirm={async () => {
              if (!toDelete) return;
              const id = toDelete.id;
              setToDelete(null);
              await run(() => deleteDepartmentAction({ departmentId: id }));
            }}
          />
        </>
      )}
    </ChartActionsContext.Provider>
  );
}

/** Members, to drag onto a Team Lead or Manager. Searchable, unplaced first. */
function Tray({ people }: { people: { person: ChartPerson; boss: string | null }[] }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle ? people.filter(({ person }) => person.name.toLowerCase().includes(needle)) : people;
  const unplaced = people.filter((p) => !p.boss).length;

  return (
    <aside className="flex max-h-[260px] flex-col gap-2.5 rounded-[22px] bg-surface-raised/40 p-4 ring-1 ring-inset ring-line/[0.05] lg:max-h-[72vh] lg:w-60 lg:shrink-0">
      <div>
        <h3 className="flex items-center justify-between text-[12px] text-ink">
          Members
          <span className="font-mono text-[11px] tabular-nums text-ink-dim">{unplaced} unplaced</span>
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-dim">
          Drag onto a Team Lead, or onto a Manager with no Team Leads. Everyone else is a card on the chart.
        </p>
      </div>
      <input
        id="org-chart-tray-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find someone"
        aria-label="Find a member to place"
        className="h-8 w-full rounded-lg bg-surface-control px-2.5 text-[12px] text-ink ring-1 ring-inset ring-line/[0.08] placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-focus"
      />
      {shown.length === 0 ? (
        <p className="text-[12px] text-ink-dim">{people.length === 0 ? "No members to place yet." : "Nobody by that name."}</p>
      ) : (
        <ul className="custom-scrollbar -mx-1 flex flex-col gap-0.5 overflow-y-auto">
          {shown.map(({ person, boss }) => (
            <li
              key={person.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(PERSON_DRAG_TYPE, person.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              className="flex cursor-grab items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-surface-hover/60 active:cursor-grabbing"
              title={`Drag ${person.name} onto a Team Lead or Manager`}
            >
              <UserAvatar photoURL={person.photoURL} name={person.name} size="sm" uid={person.id} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-ink">{person.name}</span>
                <span className="block truncate text-[11px] text-ink-dim">{boss ? `Under ${boss}` : "Not placed"}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}