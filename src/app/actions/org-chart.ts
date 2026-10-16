"use server";

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { requireCaller } from "@/lib/auth/caller";
import { requireAdminTools } from "@/lib/internal-management/store";
import {
  canFillSlot,
  checkConnection,
  liveParents,
  parseNodeId,
  personNodeId,
  personTier,
  readPosition,
  TIER_OF_DEPARTMENT,
  departmentNodeId,
  type ChartPosition,
  type ChartTier,
  type DepartmentSlot,
} from "@/lib/members/org-chart";
import { memberDisplayName } from "@/lib/members/profile";
import { normaliseRole, type StoredRole } from "@/lib/members/rank";
import { DEFAULT_LEAD_TITLE } from "@/lib/members/hierarchy";

/* ------------------------------------------------------------------ */
/*  Org chart: read by anyone in the workspace, wired in Admin Tools   */
/*                                                                     */
/*  `org_chart/{orgId}` holds `positions` (card → x, y) and `parents`  */
/*  (child card → boss card). The rules' catch-all keeps clients out;  */
/*  everyone reads it through `getOrgChartAction`, and only Internal   */
/*  Management with Admin Tools open can change it.                    */
/*                                                                     */
/*  Who is in a department and who leads it stay where they always     */
/*  were, on the person and the department. The chart adds only the    */
/*  wiring above departments and where each card sits.                 */
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
  leadId: string | null;
  leadTitle: string;
  /** Null when unset, or when that person no longer holds the rank. */
  executiveId: string | null;
  managerId: string | null;
}

export interface OrgChart {
  people: ChartPerson[];
  departments: ChartDepartment[];
  positions: Record<string, ChartPosition>;
  /** Child card → boss card, already cleared of wires that no longer hold. */
  parents: Record<string, string>;
}

interface Loaded extends OrgChart {
  tiers: Map<string, { kind: "person" | "department"; tier: ChartTier }>;
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

  // A slot whose holder has since lost the rank reads as empty.
  const roleOf = new Map(people.map((p) => [p.id, p.role]));
  const slotHolder = (slot: DepartmentSlot, value: unknown) =>
    typeof value === "string" && canFillSlot(slot, roleOf.get(value)) ? value : null;

  const departments: ChartDepartment[] = departmentsSnap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: (data.name as string) || "Untitled",
        leadId: typeof data.leadId === "string" ? data.leadId : null,
        leadTitle: typeof data.leadTitle === "string" && data.leadTitle ? data.leadTitle : DEFAULT_LEAD_TITLE,
        executiveId: slotHolder("executive", data.executiveId),
        managerId: slotHolder("manager", data.managerId),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const tiers = new Map<string, { kind: "person" | "department"; tier: ChartTier }>();
  for (const person of people) {
    const tier = personTier(person.role);
    if (tier) tiers.set(personNodeId(person.id), { kind: "person", tier });
  }
  for (const department of departments) {
    tiers.set(departmentNodeId(department.id), { kind: "department", tier: TIER_OF_DEPARTMENT });
  }

  const data = chartSnap.data() ?? {};
  const positions: Record<string, ChartPosition> = {};
  for (const [id, value] of Object.entries((data.positions ?? {}) as Record<string, unknown>)) {
    const position = readPosition(value);
    if (position && tiers.has(id)) positions[id] = position;
  }

  return {
    people,
    departments,
    positions,
    parents: liveParents((data.parents ?? {}) as Record<string, unknown>, tiers),
    tiers,
  };
}

/** Everything the canvas draws. Anyone in the workspace may read it. */
export async function getOrgChartAction(): Promise<Result<{ chart: OrgChart }>> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const { tiers: _tiers, ...chart } = await loadChart(caller.orgId);
    return { success: true, chart };
  } catch (err) {
    console.error("[OrgChart] Could not load:", err);
    return { success: false, error: "Could not load the org chart." };
  }
}

/** Wires `child` under `parent`, replacing any boss it had. */
export async function connectOrgChartAction(input: { parent: string; child: string }): Promise<Result> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };
  if (!parseNodeId(input.parent) || !parseNodeId(input.child)) return { success: false, error: "That isn't a card." };

  try {
    const { tiers } = await loadChart(caller.orgId);
    const verdict = checkConnection(tiers.get(input.parent) ?? null, tiers.get(input.child) ?? null);
    if (!verdict.ok) return { success: false, error: verdict.error };

    await chartDoc(caller.orgId).set({ parents: { [input.child]: input.parent }, updatedAt: new Date() }, { merge: true });
    return { success: true };
  } catch (err) {
    console.error("[OrgChart] Could not connect:", err);
    return { success: false, error: "Could not save that connection. Try again." };
  }
}

/** Takes a card off its boss. */
export async function disconnectOrgChartAction(input: { child: string }): Promise<Result> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };
  if (!parseNodeId(input.child)) return { success: false, error: "That isn't a card." };

  try {
    await chartDoc(caller.orgId).set(
      { parents: { [input.child]: FieldValue.delete() }, updatedAt: new Date() },
      { merge: true }
    );
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
 * Fills a department's Executive or Manager slot, or clears it with
 * `uid: null`. The person must already hold that rank; the chart gives it
 * to them first through `adminSetRankAction`, so plan limits still hold.
 */
export async function setDepartmentSlotAction(input: {
  departmentId: string;
  slot: DepartmentSlot;
  uid: string | null;
}): Promise<Result> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };
  if (input.slot !== "executive" && input.slot !== "manager") return { success: false, error: "That isn't a slot." };
  if (typeof input.departmentId !== "string" || !input.departmentId) {
    return { success: false, error: "That department no longer exists." };
  }

  try {
    const departmentRef = adminDb.collection(DEPARTMENTS).doc(input.departmentId);
    const [departmentSnap, personSnap] = await Promise.all([
      departmentRef.get(),
      input.uid ? adminDb.collection(USERS).doc(input.uid).get() : Promise.resolve(null),
    ]);
    if (!departmentSnap.exists || departmentSnap.data()?.orgId !== caller.orgId) {
      return { success: false, error: "That department no longer exists." };
    }

    if (input.uid) {
      const person = personSnap?.data();
      if (!personSnap?.exists || person?.orgId !== caller.orgId) {
        return { success: false, error: "That person isn't in your workspace." };
      }
      if (!canFillSlot(input.slot, person?.role)) {
        return {
          success: false,
          error: `Only ${input.slot === "executive" ? "Executives" : "Managers"} can fill that slot. Change their rank first.`,
        };
      }
    }

    await departmentRef.update({ [input.slot === "executive" ? "executiveId" : "managerId"]: input.uid ?? null });
    return { success: true };
  } catch (err) {
    console.error("[OrgChart] Could not set a department slot:", err);
    return { success: false, error: "Could not save that. Try again." };
  }
}
