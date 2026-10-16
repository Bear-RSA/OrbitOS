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
  setDepartmentSlotAction,
  type ChartDepartment,
  type ChartPerson,
  type OrgChart,
} from "@/app/actions/org-chart";
import { adminSetRankAction } from "@/app/actions/admin-tools";
import { assignDepartmentAction, deleteDepartmentAction, setDepartmentLeadAction } from "@/app/actions/team-structure";
import { DepartmentDialog } from "@/components/members/department-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DialogNotice } from "@/components/ui/dialog-parts";
import { UserAvatar } from "@/components/ui/user-avatar";
import { invalidateTeamLeads } from "@/hooks/use-member-rank";
import { ADMIN_LOCKED_ERROR } from "@/lib/internal-management/rules";
import {
  canFillSlot,
  checkConnection,
  departmentNodeId,
  SLOT_RANK,
  personNodeId,
  personTier,
  startingPosition,
  TIER_OF_DEPARTMENT,
  type ChartPosition,
  type ChartTier,
} from "@/lib/members/org-chart";
import { RANK_LABEL, rankOf } from "@/lib/members/rank";
import { RANK_TEXT } from "@/components/ui/rank-styles";
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

function tierMap(chart: OrgChart) {
  const tiers = new Map<string, { kind: "person" | "department"; tier: ChartTier }>();
  for (const person of chart.people) {
    const tier = personTier(person.role);
    if (tier) tiers.set(personNodeId(person.id), { kind: "person", tier });
  }
  for (const department of chart.departments) {
    tiers.set(departmentNodeId(department.id), { kind: "department", tier: TIER_OF_DEPARTMENT });
  }
  return tiers;
}

function buildNodes(chart: OrgChart, moved: Record<string, ChartPosition>, editable: boolean): Node[] {
  const placed = (id: string, tier: ChartTier, index: number) =>
    moved[id] ?? chart.positions[id] ?? startingPosition(tier, index);

  const byTier = new Map<ChartTier, number>();
  const nextIndex = (tier: ChartTier) => {
    const i = byTier.get(tier) ?? 0;
    byTier.set(tier, i + 1);
    return i;
  };

  const people: PersonNode[] = [];
  for (const person of chart.people) {
    const tier = personTier(person.role);
    if (!tier) continue;
    const id = personNodeId(person.id);
    people.push({
      id,
      type: "person",
      position: placed(id, tier, nextIndex(tier)),
      data: { person, tier },
      draggable: editable,
    });
  }

  const departments: DepartmentNode[] = chart.departments.map((department) => {
    const id = departmentNodeId(department.id);
    const inIt = chart.people.filter((p) => p.departmentId === department.id);
    const byId = (uid: string | null) => (uid ? (chart.people.find((p) => p.id === uid) ?? null) : null);
    return {
      id,
      type: "department",
      position: placed(id, TIER_OF_DEPARTMENT, nextIndex(TIER_OF_DEPARTMENT)),
      data: {
        department,
        executive: byId(department.executiveId),
        manager: byId(department.managerId),
        lead: inIt.find((p) => p.id === department.leadId) ?? null,
        members: inIt.filter((p) => p.id !== department.leadId),
      },
      draggable: editable,
    };
  });

  return [...people, ...departments];
}

function buildEdges(parents: Record<string, string>): Edge[] {
  return Object.entries(parents).map(([child, parent]) => ({
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

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(buildNodes(chart, moved.current, editable));

  useEffect(() => {
    setNodes(buildNodes(chart, moved.current, editable));
    setParents(chart.parents);
  }, [chart, editable, setNodes]);

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

  const edges = useMemo(() => buildEdges(parents), [parents]);
  const tiers = useMemo(() => tierMap(chart), [chart]);

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
      checkConnection(tiers.get(connection.source) ?? null, tiers.get(connection.target) ?? null).ok,
    [tiers]
  );

  const onConnect = useCallback(
    async (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target) return;
      const before = parents;
      setParents({ ...parents, [target]: source });
      setError(null);
      const result = await connectOrgChartAction({ parent: source, child: target });
      if (!result.success) {
        setParents(before);
        fail(result.error);
      }
    },
    [parents, fail]
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
      }
    },
    [parents, fail]
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
      onMovePerson: (uid, departmentId) => void run(() => assignDepartmentAction({ memberUid: uid, departmentId })),
      // Whoever is picked takes the Team Lead rank, then moves in if they
      // are elsewhere: a lead has to be in the department they lead.
      onSetLead: (departmentId, uid) =>
        void run(async () => {
          const person = uid ? chart.people.find((p) => p.id === uid) : null;
          if (person && person.role !== "TEAM_LEAD") {
            const ranked = await adminSetRankAction({ targetUid: person.id, rank: "TEAM_LEAD" });
            if (!ranked.success) return ranked;
          }
          if (person && person.departmentId !== departmentId) {
            const moved = await assignDepartmentAction({ memberUid: person.id, departmentId });
            if (!moved.success) return moved;
          }
          const result = await setDepartmentLeadAction({ departmentId, memberUid: uid });
          if (result.success) invalidateTeamLeads();
          return result;
        }),
      onRenameDepartment: (department) =>
        setDepartmentDialog({
          open: true,
          department: { ...department, orgId: "", createdAt: 0 },
        }),
      // Picking someone without the slot's rank gives it to them first,
      // through the same checks and plan limits as the Ranks section.
      onSetSlot: (departmentId, slot, uid) =>
        void run(async () => {
          const person = uid ? chart.people.find((p) => p.id === uid) : null;
          if (person && !canFillSlot(slot, person.role)) {
            const ranked = await adminSetRankAction({ targetUid: person.id, rank: SLOT_RANK[slot] });
            if (!ranked.success) return ranked;
          }
          return setDepartmentSlotAction({ departmentId, slot, uid });
        }),
      candidates: chart.people.filter((p) => p.role !== "OWNER").sort((a, b) => a.name.localeCompare(b.name)),
      onDeleteDepartment: setToDelete,
      onDisconnect: (child) => void disconnect(child),
    }),
    [editable, viewerId, canManage, onOpenProfile, onManage, run, disconnect, chart.people]
  );

  /* Members and Team Leads, placed or not: the tray is where they are
     picked up to be dropped into a department. Owners get a card, and
     Executives and Managers fill a department's slots, so none of them
     are here. Unplaced people come first. */
  const tray = useMemo(
    () =>
      chart.people
        .filter((p) => p.role === "MEMBER" || p.role === "TEAM_LEAD")
        .sort((a, b) => Number(!!a.departmentId) - Number(!!b.departmentId) || a.name.localeCompare(b.name)),
    [chart.people]
  );
  const departmentNames = useMemo(
    () => new Map(chart.departments.map((d) => [d.id, d.name])),
    [chart.departments]
  );

  return (
    <ChartActionsContext.Provider value={actions}>
      <div className="flex flex-col gap-3">
        {editable && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[12px] text-ink-dim">
              <Plug className="h-3.5 w-3.5" aria-hidden />
              Wire an Owner&apos;s bottom plug to a department&apos;s top plug, then fill the department&apos;s slots.
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
          {editable && <Tray people={tray} departmentNames={departmentNames} />}

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
            description="The people in it stay in the workspace and go back to the tray."
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

/** Everyone who can go in a department, to drag onto one. Searchable, unplaced first. */
function Tray({ people, departmentNames }: { people: ChartPerson[]; departmentNames: ReadonlyMap<string, string> }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle ? people.filter((p) => p.name.toLowerCase().includes(needle)) : people;
  const unplaced = people.filter((p) => !p.departmentId).length;

  return (
    <aside className="flex max-h-[260px] flex-col gap-2.5 rounded-[22px] bg-surface-raised/40 p-4 ring-1 ring-inset ring-line/[0.05] lg:max-h-[72vh] lg:w-60 lg:shrink-0">
      <div>
        <h3 className="flex items-center justify-between text-[12px] text-ink">
          People
          <span className="font-mono text-[11px] tabular-nums text-ink-dim">{unplaced} unplaced</span>
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-dim">Drag a member onto a department card.</p>
      </div>
      <input
        id="org-chart-tray-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find someone"
        aria-label="Find someone to place"
        className="h-8 w-full rounded-lg bg-surface-control px-2.5 text-[12px] text-ink ring-1 ring-inset ring-line/[0.08] placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-focus"
      />
      {shown.length === 0 ? (
        <p className="text-[12px] text-ink-dim">{people.length === 0 ? "No members to place yet." : "Nobody by that name."}</p>
      ) : (
        <ul className="custom-scrollbar -mx-1 flex flex-col gap-0.5 overflow-y-auto">
          {shown.map((person) => {
            const rank = rankOf(person.role, false);
            const department = person.departmentId ? departmentNames.get(person.departmentId) : null;
            return (
              <li
                key={person.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(PERSON_DRAG_TYPE, person.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="flex cursor-grab items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-surface-hover/60 active:cursor-grabbing"
                title={`Drag ${person.name} onto a department`}
              >
                <UserAvatar photoURL={person.photoURL} name={person.name} size="sm" rank={rank} uid={person.id} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-ink">{person.name}</span>
                  <span className="block truncate text-[11px] text-ink-dim">
                    {department ?? "Not placed"}
                    {rank !== "MEMBER" && <span className={RANK_TEXT[rank]}> · {RANK_LABEL[rank]}</span>}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
