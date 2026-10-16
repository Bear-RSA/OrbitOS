import { departmentAbove, departmentNodeId, personNodeId } from "./org-chart";
import { normaliseRole } from "./rank";

/* ------------------------------------------------------------------ */
/*  The Teams tree, read from the org chart's wires                    */
/*                                                                     */
/*  Internal Management wires the chart in Admin Tools; Teams draws    */
/*  the same structure as the old card tree:                           */
/*                                                                     */
/*    Owners          one row of equals                                */
/*    Executives      under their Owner                                */
/*    Departments     columns, under an Executive or an Owner          */
/*      Managers        inside the department card                     */
/*        Team Leads      under their Manager                          */
/*          Members         under their Team Lead, or the Manager      */
/*                                                                     */
/*  People filed in a department before the wiring existed, and not    */
/*  wired yet, still show in it under "Members". Anyone placed nowhere */
/*  goes in the "not in a department" bucket.                          */
/*                                                                     */
/*  Pure, so the layout and the tests read the same answer.            */
/* ------------------------------------------------------------------ */

export interface TreePerson {
  id: string;
  name?: string | null;
  role: unknown;
  departmentId?: string | null;
}

export interface TreeDepartment {
  id: string;
  name: string;
}

export interface LeadBranch<P> {
  lead: P;
  members: P[];
}

export interface ManagerBranch<P> {
  manager: P;
  leads: LeadBranch<P>[];
  /** Members wired straight under the Manager, with no Team Lead between. */
  members: P[];
}

export interface DepartmentColumn<P, D> {
  department: D;
  /** The Executive or Owner it hangs from, or null when not wired yet. */
  bossId: string | null;
  managers: ManagerBranch<P>[];
  /** Filed here before the chart, and not wired to anyone in it. */
  filed: P[];
  /** Everyone in the column, for its count. */
  count: number;
}

export interface WiredTree<P, D> {
  owners: P[];
  /** Ordered by their Owner, so each sits under the right card. */
  executives: { person: P; ownerId: string }[];
  /** Ordered by the card they hang from; unwired departments last. */
  departments: DepartmentColumn<P, D>[];
  unassigned: P[];
}

const byName = (a: TreePerson, b: TreePerson) => (a.name ?? "").localeCompare(b.name ?? "");

export function buildWiredTree<P extends TreePerson, D extends TreeDepartment>(
  people: readonly P[],
  departments: readonly D[],
  parents: Readonly<Record<string, string>>,
  /** Put this Owner first in the row: the viewer, on their own screen. */
  firstOwnerId: string | null = null
): WiredTree<P, D> {
  const byId = new Map(people.map((p) => [p.id, p]));
  const childrenOf = new Map<string, string[]>();
  for (const [child, parent] of Object.entries(parents)) {
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), child]);
  }
  const peopleUnder = (node: string): P[] =>
    (childrenOf.get(node) ?? [])
      .filter((id) => id.startsWith("p:"))
      .map((id) => byId.get(id.slice(2)))
      .filter((p): p is P => Boolean(p))
      .sort(byName);
  const roleOf = (p: P) => normaliseRole(p.role);

  const owners = people
    .filter((p) => roleOf(p) === "OWNER")
    .sort((a, b) => {
      if ((a.id === firstOwnerId) !== (b.id === firstOwnerId)) return a.id === firstOwnerId ? -1 : 1;
      return byName(a, b);
    });
  const ownerIndex = new Map(owners.map((o, i) => [o.id, i]));

  const executives = people
    .filter((p) => roleOf(p) === "EXECUTIVE")
    .flatMap((person) => {
      const boss = parents[personNodeId(person.id)];
      const ownerId = boss?.startsWith("p:") ? boss.slice(2) : null;
      return ownerId && ownerIndex.has(ownerId) ? [{ person, ownerId }] : [];
    })
    .sort((a, b) => ownerIndex.get(a.ownerId)! - ownerIndex.get(b.ownerId)! || byName(a.person, b.person));
  const executiveIndex = new Map(executives.map((e, i) => [e.person.id, i]));

  const placed = new Set<string>([...owners.map((o) => o.id), ...executives.map((e) => e.person.id)]);

  const columns: DepartmentColumn<P, D>[] = departments.map((department) => {
    const node = departmentNodeId(department.id);
    const boss = parents[node];
    const bossId = boss?.startsWith("p:") && (ownerIndex.has(boss.slice(2)) || executiveIndex.has(boss.slice(2)))
      ? boss.slice(2)
      : null;

    const managers = peopleUnder(node)
      .filter((p) => roleOf(p) === "MANAGER")
      .map((manager) => {
        const under = peopleUnder(personNodeId(manager.id));
        const leads = under
          .filter((p) => roleOf(p) === "TEAM_LEAD")
          .map((lead) => ({ lead, members: peopleUnder(personNodeId(lead.id)) }));
        return { manager, leads, members: under.filter((p) => roleOf(p) !== "TEAM_LEAD") };
      });

    for (const m of managers) {
      placed.add(m.manager.id);
      for (const l of m.leads) {
        placed.add(l.lead.id);
        l.members.forEach((p) => placed.add(p.id));
      }
      m.members.forEach((p) => placed.add(p.id));
    }

    return { department, bossId, managers, filed: [] as P[], count: 0 };
  });

  // Filed before the chart and not wired anywhere yet: still shown in it.
  const columnById = new Map(columns.map((c) => [c.department.id, c]));
  const unassigned: P[] = [];
  for (const person of people) {
    if (placed.has(person.id) || roleOf(person) === "OWNER") continue;
    const wiredDepartment = departmentAbove(personNodeId(person.id), parents);
    const column = columnById.get(wiredDepartment ?? person.departmentId ?? "");
    if (column) column.filed.push(person);
    else unassigned.push(person);
  }

  for (const column of columns) {
    column.filed.sort(byName);
    column.count =
      column.filed.length +
      column.managers.reduce(
        (n, m) => n + 1 + m.members.length + m.leads.reduce((k, l) => k + 1 + l.members.length, 0),
        0
      );
  }

  // Under its card's owner, then its Executive, then by name; unwired last.
  const rank = (c: DepartmentColumn<P, D>): [number, number] => {
    if (!c.bossId) return [Infinity, Infinity];
    const exec = executives[executiveIndex.get(c.bossId) ?? -1];
    if (exec) return [ownerIndex.get(exec.ownerId)!, executiveIndex.get(c.bossId)!];
    return [ownerIndex.get(c.bossId) ?? Infinity, -1];
  };
  columns.sort((a, b) => {
    const [ao, ae] = rank(a);
    const [bo, be] = rank(b);
    return ao - bo || ae - be || a.department.name.localeCompare(b.department.name);
  });

  return { owners, executives, departments: columns, unassigned: unassigned.sort(byName) };
}
