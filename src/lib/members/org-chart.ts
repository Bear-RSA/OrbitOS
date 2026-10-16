import { normaliseRole, type StoredRole } from "./rank";

/* ------------------------------------------------------------------ */
/*  Org chart                                                          */
/*                                                                     */
/*  The structure Internal Management wires up in Admin Tools, and     */
/*  Teams draws read-only. Top down, each card wired to one boss:      */
/*                                                                     */
/*    Owner                                                            */
/*      Executive         under an Owner                               */
/*        Department      under an Executive, or an Owner if none      */
/*          Manager       under a Department                           */
/*            Team Lead   under a Manager                              */
/*              Member    under a Team Lead, or a Manager if none      */
/*                                                                     */
/*  Members are not cards: they stack on their boss's card, so a big   */
/*  team stays readable. A Department card only names the department  */
/*  and counts who is under it.                                        */
/*                                                                     */
/*  Someone's department follows the wires: whatever department sits   */
/*  above them. The actions write it to `users/{uid}.departmentId` so  */
/*  everything that reads it keeps working.                            */
/*                                                                     */
/*  Saved at `org_chart/{orgId}` as card positions and a child → boss  */
/*  map. Pure functions here, so the actions, the canvas and the       */
/*  tests read the same rules.                                         */
/* ------------------------------------------------------------------ */

export type ChartNodeId = `p:${string}` | `d:${string}`;

export const personNodeId = (uid: string): ChartNodeId => `p:${uid}`;
export const departmentNodeId = (id: string): ChartNodeId => `d:${id}`;

export function parseNodeId(id: unknown): { kind: "person" | "department"; ref: string } | null {
  if (typeof id !== "string" || id.length < 3 || id.length > 200) return null;
  const ref = id.slice(2);
  if (!ref || ref.includes("/")) return null;
  if (id.startsWith("p:")) return { kind: "person", ref };
  if (id.startsWith("d:")) return { kind: "department", ref };
  return null;
}

/** What sits at a node: a department, or a person of some rank. */
export type ChartNodeKind = "DEPARTMENT" | StoredRole;

/** Row on the chart, top down. Members have no card, so no row. */
export const ROW: Record<Exclude<ChartNodeKind, "MEMBER">, number> = {
  OWNER: 0,
  EXECUTIVE: 1,
  DEPARTMENT: 2,
  MANAGER: 3,
  TEAM_LEAD: 4,
};

/** Who each kind may be wired under, nearest first. */
const BOSSES: Record<ChartNodeKind, readonly ChartNodeKind[]> = {
  OWNER: [],
  EXECUTIVE: ["OWNER"],
  DEPARTMENT: ["EXECUTIVE", "OWNER"],
  MANAGER: ["DEPARTMENT"],
  TEAM_LEAD: ["MANAGER"],
  MEMBER: ["TEAM_LEAD", "MANAGER"],
};

const KIND_LABEL: Record<ChartNodeKind, string> = {
  OWNER: "an Owner",
  EXECUTIVE: "an Executive",
  DEPARTMENT: "a department",
  MANAGER: "a Manager",
  TEAM_LEAD: "a Team Lead",
  MEMBER: "a member",
};

export function bossKindsOf(kind: ChartNodeKind): readonly ChartNodeKind[] {
  return BOSSES[kind];
}

/** Everyone but Members gets a card. */
export function hasCard(kind: ChartNodeKind): boolean {
  return kind !== "MEMBER";
}

export function kindOfRole(role: unknown): ChartNodeKind {
  return normaliseRole(role);
}

export type Verdict = { ok: true } | { ok: false; error: string };

/** Whether `child` may be wired under `parent`. */
export function checkConnection(parent: ChartNodeKind | null, child: ChartNodeKind | null): Verdict {
  if (!parent || !child) return { ok: false, error: "One of those is no longer on the chart." };
  const allowed = BOSSES[child];
  if (allowed.includes(parent)) return { ok: true };
  if (allowed.length === 0) return { ok: false, error: "Owners sit at the top. Nothing goes above them." };
  return {
    ok: false,
    error: `${capitalise(KIND_LABEL[child])} goes under ${allowed.map((k) => KIND_LABEL[k]).join(" or ")}.`,
  };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The saved child → boss map, minus any wire that no longer holds: someone
 * who left, a department deleted, or a rank change that put the two ends
 * the wrong way round.
 */
export function liveParents(saved: Record<string, unknown>, kinds: ReadonlyMap<string, ChartNodeKind>): Record<string, string> {
  const live: Record<string, string> = {};
  for (const [child, parent] of Object.entries(saved)) {
    if (typeof parent !== "string") continue;
    if (checkConnection(kinds.get(parent) ?? null, kinds.get(child) ?? null).ok) live[child] = parent;
  }
  return live;
}

/** The department above a node, following the wires up, or null. */
export function departmentAbove(node: string, parents: Readonly<Record<string, string>>): string | null {
  const seen = new Set<string>();
  let at: string | undefined = node;
  while (at && !seen.has(at)) {
    seen.add(at);
    const parsed = parseNodeId(at);
    if (parsed?.kind === "department") return parsed.ref;
    at = parents[at];
  }
  return null;
}

/** Every node under `node`, at any depth. */
export function descendantsOf(node: string, parents: Readonly<Record<string, string>>): string[] {
  const children = new Map<string, string[]>();
  for (const [child, parent] of Object.entries(parents)) {
    const list = children.get(parent) ?? [];
    list.push(child);
    children.set(parent, list);
  }
  const out: string[] = [];
  const queue = [...(children.get(node) ?? [])];
  const seen = new Set<string>([node]);
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    queue.push(...(children.get(next) ?? []));
  }
  return out;
}

/** People up the wires from `node`, nearest first. Departments are passed through. */
export function peopleAbove(node: string, parents: Readonly<Record<string, string>>): string[] {
  const out: string[] = [];
  const seen = new Set<string>([node]);
  let at = parents[node];
  while (at && !seen.has(at)) {
    seen.add(at);
    const parsed = parseNodeId(at);
    if (parsed?.kind === "person") out.push(parsed.ref);
    at = parents[at];
  }
  return out;
}

/** Would wiring `child` under `parent` make a loop? */
export function wouldLoop(child: string, parent: string, parents: Readonly<Record<string, string>>): boolean {
  return parent === child || descendantsOf(child, parents).includes(parent);
}

export interface ChartPosition {
  x: number;
  y: number;
}

/** Keeps a saved position only if it is two finite numbers inside a sane canvas. */
export function readPosition(value: unknown): ChartPosition | null {
  if (!value || typeof value !== "object") return null;
  const { x, y } = value as Record<string, unknown>;
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) > 100_000 || Math.abs(y) > 100_000) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

const ROW_HEIGHT = 230;
const COLUMN_WIDTH = 260;

/**
 * Where a card with no saved position starts: its rank's row, spread
 * across. Somewhere sensible to pick it up from, not a layout.
 */
export function startingPosition(row: number, indexInRow: number): ChartPosition {
  return { x: indexInRow * COLUMN_WIDTH, y: row * ROW_HEIGHT };
}
