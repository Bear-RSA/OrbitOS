import { departmentAbove, departmentNodeId, descendantsOf, peopleAbove, personNodeId } from "./org-chart";

/* ------------------------------------------------------------------ */
/*  Someone's place in the company, read off the org chart             */
/*                                                                     */
/*  For the profile card: the line above them from the top down,       */
/*  departments included, then who reports to them. Reports come       */
/*  straight to them or through a department they head, the way the    */
/*  chart is wired, so a Head of Department's people count as theirs.  */
/*  Everything follows the wires Internal Management drew in Admin     */
/*  Tools, so it always agrees with the Teams tree.                    */
/* ------------------------------------------------------------------ */

interface Person {
  id: string;
}

interface Department {
  id: string;
}

export type LineStep<P, D> = { kind: "person"; person: P } | { kind: "department"; department: D };

export interface ReportGroup<P, D> {
  /** The department they come through, or null when wired straight to them. */
  department: D | null;
  people: P[];
}

export interface Standing<P, D> {
  /** Who they report to, nearest first, up to an Owner. */
  reportsTo: P[];
  /** Everything above them on the wires, top first, departments included. */
  line: LineStep<P, D>[];
  /** The department they sit in, and the person wired above it. */
  department: { department: D; head: P | null } | null;
  /** Departments wired directly under them: they are their Head. */
  heads: D[];
  /** Who reports to them: straight to them first, then through each department they head. */
  reports: ReportGroup<P, D>[];
  /** Everyone in `reports`. */
  directReports: P[];
  /** Everyone under them, at any depth, through any department. */
  teamSize: number;
  /** On the chart at all: wired up, wired under, or dropped on it. */
  onChart: boolean;
}

export function standingOf<P extends Person, D extends Department>(
  uid: string,
  chart: {
    people: readonly P[];
    departments: readonly D[];
    parents: Readonly<Record<string, string>>;
    positions?: Readonly<Record<string, unknown>>;
  }
): Standing<P, D> {
  const node = personNodeId(uid);
  const people = new Map(chart.people.map((p) => [p.id, p]));
  const departments = new Map(chart.departments.map((d) => [d.id, d]));
  const childrenOf = (parent: string) =>
    Object.entries(chart.parents)
      .filter(([, boss]) => boss === parent)
      .map(([child]) => child);
  const peopleIn = (ids: string[]) =>
    ids
      .filter((id) => id.startsWith("p:"))
      .map((id) => people.get(id.slice(2)))
      .filter((p): p is P => Boolean(p));

  const reportsTo = peopleAbove(node, chart.parents)
    .map((id) => people.get(id))
    .filter((p): p is P => Boolean(p));

  // Walk the wires up, keeping departments, then turn it top-down.
  const line: LineStep<P, D>[] = [];
  const seen = new Set<string>([node]);
  for (let at = chart.parents[node]; at && !seen.has(at); at = chart.parents[at]) {
    seen.add(at);
    if (at.startsWith("p:")) {
      const person = people.get(at.slice(2));
      if (person) line.push({ kind: "person", person });
    } else if (at.startsWith("d:")) {
      const department = departments.get(at.slice(2));
      if (department) line.push({ kind: "department", department });
    }
  }
  line.reverse();

  // The department above them on the wires, not counting one they head.
  const departmentId = departmentAbove(chart.parents[node] ?? "", chart.parents);
  const sitting = departmentId ? departments.get(departmentId) : undefined;
  const headNode = sitting ? chart.parents[departmentNodeId(sitting.id)] : undefined;
  const department = sitting
    ? { department: sitting, head: headNode?.startsWith("p:") ? (people.get(headNode.slice(2)) ?? null) : null }
    : null;

  const under = childrenOf(node);
  const heads = under
    .filter((id) => id.startsWith("d:"))
    .map((id) => departments.get(id.slice(2)))
    .filter((d): d is D => Boolean(d));

  const reports: ReportGroup<P, D>[] = [];
  const straight = peopleIn(under);
  if (straight.length > 0) reports.push({ department: null, people: straight });
  for (const headed of heads) {
    reports.push({ department: headed, people: peopleIn(childrenOf(departmentNodeId(headed.id))) });
  }

  const teamSize = descendantsOf(node, chart.parents).filter((id) => id.startsWith("p:")).length;

  return {
    reportsTo,
    line,
    department,
    heads,
    reports,
    directReports: reports.flatMap((g) => g.people),
    teamSize,
    onChart: Boolean(chart.parents[node] || under.length > 0 || chart.positions?.[node]),
  };
}
