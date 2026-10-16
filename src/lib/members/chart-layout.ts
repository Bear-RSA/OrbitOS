import { tintOf, type DepartmentTint } from "./department-tint";
import {
  departmentAbove,
  departmentNodeId,
  kindOfRole,
  personNodeId,
  ROW,
  startingPosition,
  type ChartNodeKind,
  type ChartPosition,
} from "./org-chart";

/* ------------------------------------------------------------------ */
/*  Where each card sits: the Admin Tools canvas's own placement       */
/*                                                                     */
/*  The one placement rule for the chart. The Admin Tools canvas and   */
/*  the Teams tree both call it, so a card sits in the same spot in    */
/*  both. A card that was never moved starts in its row, at its turn   */
/*  in that row: people by name first, departments after.             */
/*                                                                     */
/*  Every rank above Member always has a card. A Member gets one once  */
/*  Internal Management puts them on the canvas: dropped there from    */
/*  the Members list (a saved position) or wired to anything. Until    */
/*  then they wait in the list.                                        */
/*                                                                     */
/*  Card widths are the canvas's too, so the same positions never      */
/*  overlap.                                                           */
/* ------------------------------------------------------------------ */

/** Matches `w-[200px]` on the canvas's person card. */
export const PERSON_CARD_WIDTH = 200;
/** Matches `w-[240px]` on the canvas's department card. */
export const DEPARTMENT_CARD_WIDTH = 240;

interface Person {
  id: string;
  name: string;
  role: unknown;
}

interface Department {
  id: string;
  name: string;
  tint?: unknown;
}

export type LaidOutCard<P, D> =
  | {
      id: string;
      kind: Exclude<ChartNodeKind, "DEPARTMENT">;
      position: ChartPosition;
      width: number;
      person: P;
      /** Who they report to, ready to show. Null for Owners, who report to nobody. */
      reportsTo: string | null;
      /** The colour of the department they're in, through the wires, so a team shares one shade. */
      tint: DepartmentTint | null;
    }
  | {
      id: string;
      kind: "DEPARTMENT";
      position: ChartPosition;
      width: number;
      department: D;
      /** The person wired directly above the department, or null. */
      head: P | null;
    };

interface ChartInput<P, D> {
  people: readonly P[];
  departments: readonly D[];
  positions: Readonly<Record<string, ChartPosition>>;
  parents: Readonly<Record<string, string>>;
}

/** Whether a node has been put on the canvas: dropped there, or wired either way. */
export function isOnCanvas(id: string, chart: Pick<ChartInput<unknown, unknown>, "positions" | "parents">): boolean {
  return id in chart.positions || id in chart.parents || Object.values(chart.parents).includes(id);
}

export function layOutChart<P extends Person, D extends Department>(chart: ChartInput<P, D>): LaidOutCard<P, D>[] {
  const byRow = new Map<number, number>();
  const placed = (id: string, row: number) => {
    const index = byRow.get(row) ?? 0;
    byRow.set(row, index + 1);
    return chart.positions[id] ?? startingPosition(row, index);
  };

  const byNode = new Map(chart.people.map((p) => [personNodeId(p.id) as string, p]));
  const departmentByNode = new Map(chart.departments.map((d) => [departmentNodeId(d.id) as string, d]));
  const childrenOf = new Map<string, string[]>();
  for (const [child, parent] of Object.entries(chart.parents)) {
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), child]);
  }

  /**
   * The department colour a person carries: the department they're in, or
   * for someone above departments (an Owner, a head) the nearest one under
   * them, wired straight to them first, by name when several are as near.
   */
  const shadeOf = (id: string): DepartmentTint | null => {
    const inside = departmentByNode.get(departmentNodeId(departmentAbove(id, chart.parents) ?? ""));
    if (inside) return tintOf(inside);

    const seen = new Set<string>([id]);
    let level = childrenOf.get(id) ?? [];
    while (level.length > 0) {
      const departments = level
        .map((node) => departmentByNode.get(node))
        .filter((d): d is D => d !== undefined)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (departments.length > 0) return tintOf(departments[0]);
      const next: string[] = [];
      for (const node of level) {
        if (seen.has(node)) continue;
        seen.add(node);
        next.push(...(childrenOf.get(node) ?? []));
      }
      level = next;
    }
    return null;
  };

  const cards: LaidOutCard<P, D>[] = [];
  for (const person of [...chart.people].sort((a, b) => a.name.localeCompare(b.name))) {
    const kind = kindOfRole(person.role);
    if (kind === "DEPARTMENT") continue;
    const id = personNodeId(person.id);
    if (kind === "MEMBER" && !isOnCanvas(id, chart)) continue;
    cards.push({
      id,
      kind,
      position: placed(id, ROW[kind]),
      width: PERSON_CARD_WIDTH,
      person,
      reportsTo: kind === "OWNER" ? null : reportsToText(id, chart.parents, byNode, departmentByNode),
      tint: shadeOf(id),
    });
  }

  for (const department of chart.departments) {
    const id = departmentNodeId(department.id);
    cards.push({
      id,
      kind: "DEPARTMENT",
      position: placed(id, ROW.DEPARTMENT),
      width: DEPARTMENT_CARD_WIDTH,
      department,
      head: byNode.get(chart.parents[id] ?? "") ?? null,
    });
  }
  return cards;
}

/**
 * Each person's department shade, the same one the chart gives them:
 * their card's tint where they're on it, otherwise the department
 * they're filed in. People in no department are left out.
 */
export function tintsByPerson<P extends Person & { departmentId?: string | null }, D extends Department>(
  chart: ChartInput<P, D>
): Map<string, DepartmentTint> {
  const tints = new Map<string, DepartmentTint>();
  for (const card of layOutChart(chart)) {
    if (card.kind !== "DEPARTMENT" && card.tint) tints.set(card.person.id, card.tint);
  }
  const departments = new Map(chart.departments.map((d) => [d.id, d]));
  for (const person of chart.people) {
    const filed = person.departmentId ? departments.get(person.departmentId) : undefined;
    if (!tints.has(person.id) && filed) tints.set(person.id, tintOf(filed));
  }
  return tints;
}

/**
 * Who `id` reports to, in words. Under a department they report to its
 * head, the person wired directly above it.
 */
function reportsToText(
  id: string,
  parents: Readonly<Record<string, string>>,
  people: ReadonlyMap<string, { name: string }>,
  departments: ReadonlyMap<string, { name: string }>
): string {
  const boss = parents[id];
  const person = boss ? people.get(boss) : undefined;
  if (person) return `Reports to ${person.name}`;
  const department = boss ? departments.get(boss) : undefined;
  if (department) {
    const head = people.get(parents[boss!] ?? "");
    return head ? `Reports to ${head.name} · ${department.name}` : `In ${department.name} · no head yet`;
  }
  return "Not connected yet";
}

/** Wires between cards on the canvas. */
export function cardWires(
  parents: Readonly<Record<string, string>>,
  cardIds: ReadonlySet<string>
): { from: string; to: string }[] {
  return Object.entries(parents)
    .filter(([child, parent]) => cardIds.has(child) && cardIds.has(parent))
    .map(([to, from]) => ({ from, to }));
}
