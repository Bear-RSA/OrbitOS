"use server";

import { adminDb } from "@/lib/firebase/admin";

import { requireCaller, type Caller } from "@/lib/auth/caller";
import {
  billingGuardrailsEnabled,
  resolveDepartmentLimit,
  resolveOrgTier,
  resolveRankLimits,
} from "@/lib/auth/permissions";
import {
  isInternalManagement,
  loadAdminUnlockedUntil,
  loadInternalManagementIds,
  requireAdminTools,
} from "@/lib/internal-management/store";
import {
  DEFAULT_LEAD_TITLE,
  effectiveDepartmentLimit,
  normaliseDepartmentName,
  normaliseLeadTitle,
} from "@/lib/members/hierarchy";
import { isIconName, normaliseDepartmentDescription } from "@/lib/members/department-details";
import { isDepartmentTint } from "@/lib/members/department-tint";
import { memberDisplayName } from "@/lib/members/profile";
import {
  assignableRanksFor,
  canAppointTeamLeads,
  checkRankChange,
  normaliseRole,
  type AssignableRank,
} from "@/lib/members/rank";
import { logActivity } from "@/lib/telemetry";
import type { Department } from "@/types/department";
import { TIER_DEFINITIONS } from "@/types/subscription";

/* ------------------------------------------------------------------ */
/*  Team structure: ranks below Owner, and how the workspace is laid   */
/*  out in departments                                                 */
/*                                                                     */
/*  Who is an Owner, and every department, is decided in Admin Tools   */
/*  by Internal Management. Managers choose their department's lead.   */
/*  The rules live in `lib/members/hierarchy` and `lib/members/rank`;  */
/*  these actions load what those rules need, ask them, and write the  */
/*  answer.                                                            */
/*                                                                     */
/*  Departments are never read or written by a client. The catch-all   */
/*  in firestore.rules covers the collection, so this file is the only */
/*  way in, and no rules deploy was needed to add it.                  */
/* ------------------------------------------------------------------ */

type Result = { success: true } | { success: false; error: string };

type OwnerCaller = Extract<Caller, { ok: true }>;

const USERS = "users";
const DEPARTMENTS = "departments";

export interface TeamStructure {
  /**
   * The viewer is in Internal Management. Only ever about the viewer: who
   * else is in it is never sent here, so every other owner looks equal.
   */
  viewerIsInternalManagement: boolean;
  /**
   * Everyone in Internal Management, sent ONLY to someone who is in it,
   * so Teams can keep them at the top of the roster. Empty for everyone
   * else: who is in Internal Management is kept from people outside it.
   */
  internalManagementIds: string[];
  departments: Department[];
  /** Owners now, and the plan's allowance (-1 = no limit on this plan). */
  ownerSeats: { current: number; limit: number };
  /** Whether plan limits are enforced yet. Seat counts show either way. */
  limitsEnforced: boolean;
  /** Departments this workspace may hold. 0 means the plan does not include them. */
  departmentLimit: number;
  /** Ranks the viewer may give in the rank picker, highest first. Empty for most people. */
  assignableRanks: AssignableRank[];
  /** The viewer may name department leads, which is what makes a Team Lead. */
  viewerCanAppointLeads: boolean;
}

function toDepartment(id: string, data: FirebaseFirestore.DocumentData): Department {
  return {
    id,
    orgId: data.orgId,
    name: data.name ?? "Untitled",
    leadId: typeof data.leadId === "string" ? data.leadId : null,
    leadTitle:
      typeof data.leadTitle === "string" && data.leadTitle ? data.leadTitle : DEFAULT_LEAD_TITLE,
    executiveId: typeof data.executiveId === "string" ? data.executiveId : null,
    managerId: typeof data.managerId === "string" ? data.managerId : null,
    tint: isDepartmentTint(data.tint) ? data.tint : null,
    description: normaliseDepartmentDescription(data.description),
    icon: isIconName(data.icon) ? data.icon : null,
    createdAt: data.createdAt?.toMillis?.() ?? 0,
  };
}

async function loadOwners(orgId: string) {
  const snap = await adminDb
    .collection(USERS)
    .where("orgId", "==", orgId)
    .where("role", "==", "OWNER")
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    createdAtMillis: doc.data().createdAt?.toMillis?.() ?? 0,
  }));
}

async function countOwners(orgId: string): Promise<number> {
  return (await loadOwners(orgId)).length;
}

async function loadDepartments(orgId: string): Promise<Department[]> {
  const snap = await adminDb.collection(DEPARTMENTS).where("orgId", "==", orgId).get();
  return snap.docs.map((doc) => toDepartment(doc.id, doc.data()));
}

/** A department in the caller's workspace, or null. */
async function loadOwnDepartment(caller: OwnerCaller, departmentId: unknown) {
  if (typeof departmentId !== "string" || !departmentId) return null;
  const snap = await adminDb.collection(DEPARTMENTS).doc(departmentId).get();
  if (!snap.exists || snap.data()?.orgId !== caller.orgId) return null;
  return { ref: snap.ref, department: toDepartment(snap.id, snap.data()!) };
}

/** A person in the caller's workspace, or null. */
async function loadOwnMember(caller: OwnerCaller, uid: unknown) {
  if (typeof uid !== "string" || !uid) return null;
  const snap = await adminDb.collection(USERS).doc(uid).get();
  if (!snap.exists || snap.data()?.orgId !== caller.orgId) return null;
  const data = snap.data()!;
  return {
    id: snap.id,
    // Goes into the workspace-wide activity feed, so never the email.
    name: memberDisplayName({ name: data.name as string | undefined }),
    role: normaliseRole(data.role),
    departmentId: typeof data.departmentId === "string" ? data.departmentId : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Read                                                               */
/* ------------------------------------------------------------------ */

/** Everything the Teams tree needs beyond the roster itself. Any member may read it. */
export async function getTeamStructureAction(): Promise<
  { success: true; structure: TeamStructure } | { success: false; error: string }
> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const [ownerCount, departments, tier, tierDepartmentLimit, viewerIsInternalManagement] =
      await Promise.all([
        countOwners(caller.orgId),
        loadDepartments(caller.orgId),
        resolveOrgTier(caller.orgId),
        resolveDepartmentLimit(caller.orgId),
        isInternalManagement(caller.orgId, caller.uid),
      ]);

    return {
      success: true,
      structure: {
        viewerIsInternalManagement,
        internalManagementIds: viewerIsInternalManagement ? await loadInternalManagementIds(caller.orgId) : [],
        departments,
        ownerSeats: { current: ownerCount, limit: TIER_DEFINITIONS[tier].limits.maxOwners },
        limitsEnforced: billingGuardrailsEnabled(),
        departmentLimit: effectiveDepartmentLimit(tierDepartmentLimit),
        assignableRanks: assignableRanksFor(caller.role).filter((r) => r !== "MEMBER"),
        viewerCanAppointLeads: canAppointTeamLeads(caller.role),
      },
    };
  } catch (err) {
    console.error("[TeamStructure] Could not load:", err);
    return { success: false, error: "Could not load the team structure." };
  }
}

/**
 * Who leads a department, for the Team Lead halo. Any member may read it:
 * the Teams tree already shows every lead to everyone.
 */
export async function getTeamLeadIdsAction(): Promise<
  { success: true; leadIds: string[] } | { success: false; error: string }
> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const departments = await loadDepartments(caller.orgId);
    return {
      success: true,
      leadIds: departments.flatMap((d) => (d.leadId ? [d.leadId] : [])),
    };
  } catch (err) {
    console.error("[TeamStructure] Could not load team leads:", err);
    return { success: false, error: "Could not load team leads." };
  }
}

/* ------------------------------------------------------------------ */
/*  Ranks: Executive, Manager, Member                                  */
/*                                                                     */
/*  Owner has its own flow below. Team Lead is set by naming a         */
/*  department's lead. Everything else goes through here, and the      */
/*  rules for it are in `lib/members/rank`.                            */
/* ------------------------------------------------------------------ */

const ASSIGNABLE: readonly string[] = ["EXECUTIVE", "MANAGER", "TEAM_LEAD", "MEMBER"];

export async function setMemberRankAction(input: {
  targetUid: string;
  rank: AssignableRank;
}): Promise<Result> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };
  if (!ASSIGNABLE.includes(input.rank)) return { success: false, error: "That isn't a rank." };

  try {
    const [target, limits, executives] = await Promise.all([
      loadOwnMember(caller, input.targetUid),
      resolveRankLimits(caller.orgId),
      adminDb
        .collection(USERS)
        .where("orgId", "==", caller.orgId)
        .where("role", "==", "EXECUTIVE")
        .get(),
    ]);

    const verdict = checkRankChange({
      callerId: caller.uid,
      callerRole: caller.role,
      target: target && { id: target.id, role: target.role },
      next: input.rank,
      limits,
      executiveCount: executives.docs.filter((doc) => doc.id !== input.targetUid).length,
    });
    if (!verdict.ok) return { success: false, error: verdict.error };
    if (!target) return { success: false, error: "That person isn't in your workspace." };

    await adminDb.collection(USERS).doc(target.id).update({ role: input.rank });

    await logActivity({
      eventType: "RANK_CHANGED",
      orgId: caller.orgId,
      projectId: null,
      actor: { uid: caller.uid, name: caller.name },
      metadata: {
        rank: input.rank,
        previousRank: target.role,
        targetUserId: target.id,
        memberName: target.name,
      },
    });

    return { success: true };
  } catch (err) {
    console.error("[TeamStructure] Rank change failed:", err);
    return { success: false, error: "Could not change their rank. Try again." };
  }
}

/* ------------------------------------------------------------------ */
/*  Departments: Internal Management, from Admin Tools                 */
/* ------------------------------------------------------------------ */

function nameTaken(departments: Department[], name: string, exceptId?: string) {
  const wanted = name.toLowerCase();
  return departments.some((d) => d.id !== exceptId && d.name.toLowerCase() === wanted);
}

export async function createDepartmentAction(input: {
  name: string;
  leadTitle?: string;
  tint?: string;
  description?: string;
  icon?: string;
}): Promise<Result> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };

  const parsed = normaliseDepartmentName(input.name);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const title = normaliseLeadTitle(input.leadTitle);
  if (!title.ok) return { success: false, error: title.error };

  try {
    const [existing, tierLimit] = await Promise.all([
      loadDepartments(caller.orgId),
      resolveDepartmentLimit(caller.orgId),
    ]);
    const limit = effectiveDepartmentLimit(tierLimit);

    if (limit === 0) {
      return { success: false, error: "Departments are on the Pro and Custom plans." };
    }
    if (existing.length >= limit) {
      return { success: false, error: `This workspace has reached its ${limit}-department limit.` };
    }
    if (nameTaken(existing, parsed.name)) {
      return { success: false, error: "There's already a department with that name." };
    }

    await adminDb.collection(DEPARTMENTS).add({
      orgId: caller.orgId,
      name: parsed.name,
      leadId: null,
      executiveId: null,
      managerId: null,
      leadTitle: title.title,
      tint: isDepartmentTint(input.tint) ? input.tint : null,
      description: normaliseDepartmentDescription(input.description),
      icon: isIconName(input.icon) ? input.icon : null,
      createdAt: new Date(),
      createdBy: caller.uid,
    });

    return { success: true };
  } catch (err) {
    console.error("[TeamStructure] Create department failed:", err);
    return { success: false, error: "Could not create the department. Try again." };
  }
}

/** Renames a department and sets what it calls its lead. */
export async function renameDepartmentAction(input: {
  departmentId: string;
  name: string;
  leadTitle?: string;
  tint?: string;
  description?: string;
  icon?: string;
}): Promise<Result> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };

  const parsed = normaliseDepartmentName(input.name);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const title = normaliseLeadTitle(input.leadTitle);
  if (!title.ok) return { success: false, error: title.error };

  try {
    const found = await loadOwnDepartment(caller, input.departmentId);
    if (!found) return { success: false, error: "That department no longer exists." };

    const existing = await loadDepartments(caller.orgId);
    if (nameTaken(existing, parsed.name, found.department.id)) {
      return { success: false, error: "There's already a department with that name." };
    }

    await found.ref.update({
      name: parsed.name,
      leadTitle: title.title,
      ...(isDepartmentTint(input.tint) ? { tint: input.tint } : {}),
      ...(input.description !== undefined ? { description: normaliseDepartmentDescription(input.description) } : {}),
      ...(input.icon !== undefined ? { icon: isIconName(input.icon) ? input.icon : null } : {}),
    });
    return { success: true };
  } catch (err) {
    console.error("[TeamStructure] Rename department failed:", err);
    return { success: false, error: "Could not rename the department. Try again." };
  }
}

/** Deletes the department. Its people stay in the workspace, unassigned. */
export async function deleteDepartmentAction(input: { departmentId: string }): Promise<Result> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const found = await loadOwnDepartment(caller, input.departmentId);
    if (!found) return { success: false, error: "That department no longer exists." };

    const people = await adminDb
      .collection(USERS)
      .where("orgId", "==", caller.orgId)
      .where("departmentId", "==", found.department.id)
      .get();

    // A department holds at most a workspace's worth of people, far
    // under the 500-write batch limit.
    const batch = adminDb.batch();
    for (const doc of people.docs) batch.update(doc.ref, { departmentId: null });
    batch.delete(found.ref);
    await batch.commit();

    return { success: true };
  } catch (err) {
    console.error("[TeamStructure] Delete department failed:", err);
    return { success: false, error: "Could not delete the department. Try again." };
  }
}

/** Files a member in a department, or takes them out of one with `departmentId: null`. */
export async function assignDepartmentAction(input: {
  memberUid: string;
  departmentId: string | null;
}): Promise<Result> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const member = await loadOwnMember(caller, input.memberUid);
    if (!member) return { success: false, error: "That person isn't in your workspace." };
    if (member.role === "OWNER") {
      return { success: false, error: "Owners sit above departments, so they aren't filed in one." };
    }

    const target = input.departmentId ? await loadOwnDepartment(caller, input.departmentId) : null;
    if (input.departmentId && !target) {
      return { success: false, error: "That department no longer exists." };
    }

    const batch = adminDb.batch();
    batch.update(adminDb.collection(USERS).doc(member.id), {
      departmentId: target?.department.id ?? null,
    });

    // Leaving a department means no longer leading it.
    if (member.departmentId && member.departmentId !== target?.department.id) {
      const previous = await loadOwnDepartment(caller, member.departmentId);
      if (previous?.department.leadId === member.id) {
        batch.update(previous.ref, { leadId: null });
      }
    }

    await batch.commit();
    return { success: true };
  } catch (err) {
    console.error("[TeamStructure] Assign department failed:", err);
    return { success: false, error: "Could not move them. Try again." };
  }
}

/**
 * Makes a member of the department its lead, or clears the lead with
 * `memberUid: null`. Managers and up, because naming a lead is what makes
 * someone a Team Lead.
 */
export async function setDepartmentLeadAction(input: {
  departmentId: string;
  memberUid: string | null;
}): Promise<Result> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };
  // Managers and up from Teams, or Internal Management from Admin Tools.
  if (!canAppointTeamLeads(caller.role) && !(await loadAdminUnlockedUntil(caller.orgId, caller.uid))) {
    return { success: false, error: "Only Managers and above can choose a department's lead." };
  }

  try {
    const found = await loadOwnDepartment(caller, input.departmentId);
    if (!found) return { success: false, error: "That department no longer exists." };

    if (input.memberUid) {
      const member = await loadOwnMember(caller, input.memberUid);
      if (!member || member.role === "OWNER" || member.departmentId !== found.department.id) {
        return { success: false, error: "A lead has to be a member of the department." };
      }
    }

    await found.ref.update({ leadId: input.memberUid ?? null });
    return { success: true };
  } catch (err) {
    console.error("[TeamStructure] Set lead failed:", err);
    return { success: false, error: "Could not change the lead. Try again." };
  }
}
