import { normaliseRole } from "./rank";

/* ------------------------------------------------------------------ */
/*  Org chart                                                          */
/*                                                                     */
/*  The structure Internal Management wires up in Admin Tools, and     */
/*  Teams draws read-only. Owners get a card; each department gets a   */
/*  card under its Owner, and inside it four slots, top down:          */
/*  Executive, Manager, Team Lead, members. Anyone below Owner can be  */
/*  picked for a slot; someone without its rank is given it first,     */
/*  through the same checks as the Ranks section.                      */
/*                                                                     */
/*  A wire runs from an Owner's plug down to a department's. Each      */
/*  department has at most one Owner over it.                          */
/*                                                                     */
/*  Saved at `org_chart/{orgId}` as card positions and a child → boss  */
/*  map. Pure functions here, so the actions, the canvas and the       */
/*  tests read the same rules.                                         */
/* ------------------------------------------------------------------ */

export type ChartNodeId = `p:${string}` | `d:${string}`;

/** 1 Owner, 2 department. Lower is higher up. */
export type ChartTier = 1 | 2;

export const TIER_OF_DEPARTMENT: ChartTier = 2;

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

/** The tier a person's card sits on, or null when their rank has no card. Only Owners do. */
export function personTier(role: unknown): ChartTier | null {
  return normaliseRole(role) === "OWNER" ? 1 : null;
}

/** The two department slots filled from a rank, and the rank each takes. */
export type DepartmentSlot = "executive" | "manager";
export const SLOT_RANK = { executive: "EXECUTIVE", manager: "MANAGER" } as const;

/** Whether this person can fill this slot: they must already hold its rank. */
export function canFillSlot(slot: DepartmentSlot, role: unknown): boolean {
  return normaliseRole(role) === SLOT_RANK[slot];
}

export type Verdict = { ok: true } | { ok: false; error: string };

/**
 * Whether a wire may run from `parent` down to `child`. Departments take
 * wires but never give them, and a wire never runs sideways or up.
 */
export function checkConnection(parent: { kind: "person" | "department"; tier: ChartTier } | null, child: { tier: ChartTier } | null): Verdict {
  if (!parent || !child) return { ok: false, error: "One of those cards is no longer on the chart." };
  if (parent.kind === "department") return { ok: false, error: "A department can't have anyone under it on the chart." };
  if (parent.tier >= child.tier) {
    return { ok: false, error: "Wires run down the ranks: from a higher tier to a lower one." };
  }
  return { ok: true };
}

/**
 * The saved child → boss map, minus any wire that no longer holds: a card
 * that left the chart (someone moved to Member, a department deleted), or
 * a wire a rank change turned sideways or upside down.
 */
export function liveParents(
  saved: Record<string, unknown>,
  tiers: ReadonlyMap<string, { kind: "person" | "department"; tier: ChartTier }>
): Record<string, string> {
  const live: Record<string, string> = {};
  for (const [child, parent] of Object.entries(saved)) {
    if (typeof parent !== "string") continue;
    const verdict = checkConnection(tiers.get(parent) ?? null, tiers.get(child) ?? null);
    if (verdict.ok) live[child] = parent;
  }
  return live;
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

const ROW_HEIGHT = 260;
const COLUMN_WIDTH = 240;

/**
 * Where a card with no saved position starts: its tier's row, spread
 * across. Somewhere sensible to pick it up from, not a layout.
 */
export function startingPosition(tier: ChartTier, indexInTier: number): ChartPosition {
  return { x: indexInTier * COLUMN_WIDTH, y: (tier - 1) * ROW_HEIGHT };
}
