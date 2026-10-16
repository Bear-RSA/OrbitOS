"use server";

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { requireCaller } from "@/lib/auth/caller";
import { requireAdminTools } from "@/lib/internal-management/store";
import {
  checkConnection,
  departmentAbove,
  departmentNodeId,
  descendantsOf,
  kindOfRole,
  liveParents,
  parseNodeId,
  personNodeId,
  readPosition,
  wouldLoop,
  type ChartNodeKind,
  type ChartPosition,
} from "@/lib/members/org-chart";
import { isIconName, normaliseDepartmentDescription } from "@/lib/members/department-details";
import { tintOf, type DepartmentTint } from "@/lib/members/department-tint";
import { memberDisplayName } from "@/lib/members/profile";
import { normaliseRole, type StoredRole } from "@/lib/members/rank";

/* ------------------------------------------------------------------ */
/*  Org chart: read by anyone in the workspace, wired in Admin Tools   */
/*                                                                     */
/*  `org_chart/{orgId}` holds `positions` (card → x, y) and `parents`  */
/*  (child → boss), Members included. The rules' catch-all keeps       */
/*  clients out; everyone reads it through `getOrgChartAction`, and    */
/*  only Internal Management with Admin Tools open can change it.      */
/*                                                                     */
/*  A wire also files people: after every change, everyone under it    */
/*  gets `users/{uid}.departmentId` set to the department above them,  */
/*  so the roster, tickets and the Manage dialog read the same answer. */
/* ------------------------------------------------------------------ */

const USERS = "users";
const DEPARTMENTS = "departments";
const MAX_POSITIONS_PER_SAVE = 300;

type Result<T = object> = ({ success: true } & T) | { success: false; error: string };

function chartDoc(orgId: string) {
  return adminDb.collection("org_chart").doc(orgId);
}

export interface ChartPerson {
  id: string;
  name: string;
  photoURL: string | null;
  role: StoredRole;
  departmentId: string | null;
}

export interface ChartDepartment {
  id: string;
  name: string;
  leadTitle: string;
  /** Always set: the saved tint, or the one `tintOf` picks for an older department. */
  tint: DepartmentTint;
  description: string | null;
  /** A Lucide icon name, or null for the default mark. */
  icon: string | null;
}

export interface OrgChart {
  people: ChartPerson[];
  departments: ChartDepartment[];
  positions: Record<string, ChartPosition>;
  /** Child → boss, Members included, already cleared of wires that no longer hold. */
  parents: Record<string, string>;
}

interface Loaded extends OrgChart {
  kinds: Map<string, ChartNodeKind>;
}

async function loadChart(orgId: string): Promise<Loaded> {
  const [usersSnap, departmentsSnap, chartSnap] = await Promise.all([
    adminDb.collection(USERS).where("orgId", "==", orgId).get(),
    adminDb.collection(DEPARTMENTS).where("orgId", "==", orgId).get(),
    chartDoc(orgId).get(),
  ]);

  const people: ChartPerson[] = usersSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: memberDisplayName({ name: data.name as string | undefined }),
      photoURL: (data.photoURL as string | null) ?? null,
      role: normaliseRole(data.role),
      departmentId: typeof data.departmentId === "string" ? data.departmentId : null,
    };
  });

  const departments: ChartDepartment[] = departmentsSnap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: (data.name as string) || "Untitled",
        leadTitle: typeof data.leadTitle === "string" ? data.leadTitle : "",
        tint: tintOf({ id: doc.id, tint: data.tint }),
        description: normaliseDepartmentDescription(data.description),
        icon: isIconName(data.icon) ? data.icon : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const kinds = new Map<string, ChartNodeKind>();
  for (const person of people) kinds.set(personNodeId(person.id), kindOfRole(person.role));
  for (const department of departments) kinds.set(departmentNodeId(department.id), "DEPARTMENT");

  const data = chartSnap.data() ?? {};
  const positions: Record<string, ChartPosition> = {};
  for (const [id, value] of Object.entries((data.positions ?? {}) as Record<string, unknown>)) {
    const position = readPosition(value);
    if (position && kinds.has(id)) positions[id] = position;
  }

  return {
    people,
    departments,
    positions,
    parents: liveParents((data.parents ?? {}) as Record<string, unknown>, kinds),
    kinds,
  };
}

/**
 * Files `node` and everyone under it in the department above them now.
 * Only people whose department actually changes are written.
 */
async function refileUnder(node: string, chart: Loaded, parents: Record<string, string>) {
  const current = new Map(chart.people.map((p) => [p.id, p.departmentId]));
  const batch = adminDb.batch();
  let writes = 0;
  for (const id of [node, ...descendantsOf(node, parents)]) {
    const parsed = parseNodeId(id);
    if (parsed?.kind !== "person" || !current.has(parsed.ref)) continue;
    const next = departmentAbove(id, parents);
    if (current.get(parsed.ref) === next) continue;
    batch.update(adminDb.collection(USERS).doc(parsed.ref), { departmentId: next });
    writes += 1;
  }
  if (writes > 0) await batch.commit();
}

/** Everything the canvas draws. Anyone in the workspace may read it. */
export async function getOrgChartAction(): Promise<Result<{ chart: OrgChart }>> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const { kinds: _kinds, ...chart } = await loadChart(caller.orgId);
    return { success: true, chart };
  } catch (err) {
    console.error("[OrgChart] Could not load:", err);
    return { success: false, error: "Could not load the org chart." };
  }
}

/** Wires `child` under `parent`, replacing any boss it had, and files everyone under it. */
export async function connectOrgChartAction(input: { parent: string; child: string }): Promise<Result> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };
  if (!parseNodeId(input?.parent) || !parseNodeId(input?.child)) return { success: false, error: "That isn't on the chart." };

  try {
    const chart = await loadChart(caller.orgId);
    const verdict = checkConnection(chart.kinds.get(input.parent) ?? null, chart.kinds.get(input.child) ?? null);
    if (!verdict.ok) return { success: false, error: verdict.error };
    if (wouldLoop(input.child, input.parent, chart.parents)) {
      return { success: false, error: "That would put them under someone who's under them." };
    }

    await chartDoc(caller.orgId).set({ parents: { [input.child]: input.parent }, updatedAt: new Date() }, { merge: true });
    await refileUnder(input.child, chart, { ...chart.parents, [input.child]: input.parent });
    return { success: true };
  } catch (err) {
    console.error("[OrgChart] Could not connect:", err);
    return { success: false, error: "Could not save that connection. Try again." };
  }
}

/** Takes a card, or a member, off its boss. Anyone under a person unplugged leaves the department with them. */
export async function disconnectOrgChartAction(input: { child: string }): Promise<Result> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };
  if (!parseNodeId(input?.child)) return { success: false, error: "That isn't on the chart." };

  try {
    const chart = await loadChart(caller.orgId);
    await chartDoc(caller.orgId).set(
      { parents: { [input.child]: FieldValue.delete() }, updatedAt: new Date() },
      { merge: true }
    );
    const next = { ...chart.parents };
    delete next[input.child];
    await refileUnder(input.child, chart, next);
    return { success: true };
  } catch (err) {
    console.error("[OrgChart] Could not disconnect:", err);
    return { success: false, error: "Could not remove that connection. Try again." };
  }
}

/** Saves where cards were dropped. Unknown cards and junk numbers are skipped. */
export async function saveOrgChartPositionsAction(input: Record<string, unknown>): Promise<Result> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };

  const entries = Object.entries(input ?? {}).slice(0, MAX_POSITIONS_PER_SAVE);
  const positions: Record<string, ChartPosition> = {};
  for (const [id, value] of entries) {
    const position = readPosition(value);
    if (position && parseNodeId(id)) positions[id] = position;
  }
  if (Object.keys(positions).length === 0) return { success: true };

  try {
    await chartDoc(caller.orgId).set({ positions, updatedAt: new Date() }, { merge: true });
    return { success: true };
  } catch (err) {
    console.error("[OrgChart] Could not save positions:", err);
    return { success: false, error: "Could not save the layout." };
  }
}

/**
 * Takes a member off the canvas and back to the Members list: their card's
 * position and their wire go, and they leave whatever department they were in.
 * Anything wired under them is unplugged too, so nothing hangs from a card
 * that is gone.
 */
export async function removeFromCanvasAction(input: { child: string }): Promise<Result> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };
  const parsed = parseNodeId(input?.child);
  if (parsed?.kind !== "person") return { success: false, error: "Only people can be taken off the canvas." };

  try {
    const chart = await loadChart(caller.orgId);
    if (chart.kinds.get(input.child) !== "MEMBER") {
      return { success: false, error: "Only members come off the canvas. Everyone else always has a card." };
    }

    const under = Object.entries(chart.parents).filter(([, parent]) => parent === input.child).map(([child]) => child);
    const parents: Record<string, FieldValue> = { [input.child]: FieldValue.delete() };
    for (const child of under) parents[child] = FieldValue.delete();
    await chartDoc(caller.orgId).set(
      { parents, positions: { [input.child]: FieldValue.delete() }, updatedAt: new Date() },
      { merge: true }
    );

    const next = { ...chart.parents };
    delete next[input.child];
    for (const child of under) delete next[child];
    await refileUnder(input.child, chart, next);
    for (const child of under) await refileUnder(child, chart, next);
    return { success: true };
  } catch (err) {
    console.error("[OrgChart] Could not take someone off the canvas:", err);
    return { success: false, error: "Could not take them off the chart. Try again." };
  }
}