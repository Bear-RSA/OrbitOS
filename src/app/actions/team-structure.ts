"use server";

import { adminDb } from "@/lib/firebase/admin";

import { requireCaller, requireOwner, type Caller } from "@/lib/auth/caller";
import {
  billingGuardrailsEnabled,
  resolveDepartmentLimit,
  resolveOrgTier,
  validateTierQuota,
} from "@/lib/auth/permissions";
import {
  checkOwnershipChange,
  DEFAULT_LEAD_TITLE,
  effectiveDepartmentLimit,
  normaliseDepartmentName,
  normaliseLeadTitle,
  resolvePrimaryOwnerId,
  type OwnershipChange,
} from "@/lib/members/hierarchy";
import { memberDisplayName } from "@/lib/members/profile";
import { logActivity } from "@/lib/telemetry";
import type { Department } from "@/types/department";
import { TIER_DEFINITIONS } from "@/types/subscription";

/* ------------------------------------------------------------------ */
/*  Team structure: who owns the workspace, and how it is arranged    */
/*                                                                     */
/*  Ownership changes are the main owner's alone. Departments are any  */
/*  owner's, the same as every other seat control. The rules behind    */
/*  both live in `lib/members/hierarchy`; these actions load what      */
/*  those rules need, ask them, and write the answer.                  */
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
   * The account holder's uid, sent ONLY to the account holder. Every other
   * viewer gets null and sees all owners as equals: who holds the account
   * is the account holder's business.
   */
  accountHolderId: string | null;
  viewerIsAccountHolder: boolean;
  departments: Department[];
  /** Owners now, and the plan's allowance (-1 = no limit on this plan). */
  ownerSeats: { current: number; limit: number };
  /** Whether plan limits are enforced yet. Seat counts show either way. */
  limitsEnforced: boolean;
  /** Departments this workspace may hold. 0 means the plan does not include them. */
  departmentLimit: number;
}

function toDepartment(id: string, data: FirebaseFirestore.DocumentData): Department {
  return {
    id,
    orgId: data.orgId,
    name: data.name ?? "Untitled",
    leadId: typeof data.leadId === "string" ? data.leadId : null,
    leadTitle:
      typeof data.leadTitle === "string" && data.leadTitle ? data.leadTitle : DEFAULT_LEAD_TITLE,
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

async function loadPrimaryOwnerId(orgId: string): Promise<{ primaryOwnerId: string | null; ownerCount: number }> {
  const [orgSnap, owners] = await Promise.all([
    adminDb.collection("organizations").doc(orgId).get(),
    loadOwners(orgId),
  ]);

  return {
    primaryOwnerId: resolvePrimaryOwnerId(orgSnap.data()?.ownerId, owners),
    ownerCount: owners.length,
  };
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
    role: data.role === "OWNER" ? ("OWNER" as const) : ("MEMBER" as const),
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
    const [{ primaryOwnerId, ownerCount }, departments, tier, tierDepartmentLimit] =
      await Promise.all([
        loadPrimaryOwnerId(caller.orgId),
        loadDepartments(caller.orgId),
        resolveOrgTier(caller.orgId),
        resolveDepartmentLimit(caller.orgId),
      ]);

    const viewerIsAccountHolder = primaryOwnerId === caller.uid;

    return {
      success: true,
      structure: {
        accountHolderId: viewerIsAccountHolder ? primaryOwnerId : null,
        viewerIsAccountHolder,
        departments,
        ownerSeats: { current: ownerCount, limit: TIER_DEFINITIONS[tier].limits.maxOwners },
        limitsEnforced: billingGuardrailsEnabled(),
        departmentLimit: effectiveDepartmentLimit(tierDepartmentLimit),
      },
    };
  } catch (err) {
    console.error("[TeamStructure] Could not load:", err);
    return { success: false, error: "Could not load the team structure." };
  }
}

/* ------------------------------------------------------------------ */
/*  Ownership: main owner only                                         */
/* ------------------------------------------------------------------ */

async function changeOwnership(change: OwnershipChange, targetUid: string): Promise<Result> {
  const caller = await requireOwner();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const [{ primaryOwnerId }, target] = await Promise.all([
      loadPrimaryOwnerId(caller.orgId),
      loadOwnMember(caller, targetUid),
    ]);

    const verdict = checkOwnershipChange({
      change,
      callerId: caller.uid,
      callerOrgId: caller.orgId,
      primaryOwnerId,
      target: target && { id: target.id, orgId: caller.orgId, role: target.role },
    });
    if (!verdict.ok) return { success: false, error: verdict.error };
    // checkOwnershipChange refuses a null target, so this is for the compiler.
    if (!target) return { success: false, error: "That person isn't in your workspace." };

    if (change === "promote") {
      const quota = await validateTierQuota(caller.orgId, "owners");
      if (!quota.allowed) return { success: false, error: quota.error ?? "No owner seat is free." };

      // Owners sit above departments, so a promotion takes them out of
      // theirs, and out of leading it.
      const batch = adminDb.batch();
      batch.update(adminDb.collection(USERS).doc(target.id), { role: "OWNER", departmentId: null });

      const led = await adminDb
        .collection(DEPARTMENTS)
        .where("orgId", "==", caller.orgId)
        .where("leadId", "==", target.id)
        .get();
      for (const doc of led.docs) batch.update(doc.ref, { leadId: null });

      await batch.commit();
    } else if (change === "demote") {
      // They go back to taking up a member seat, so there has to be one.
      const quota = await validateTierQuota(caller.orgId, "members");
      if (!quota.allowed) {
        return {
          success: false,
          error: quota.error ?? "There's no member seat free for them on this plan.",
        };
      }
      await adminDb.collection(USERS).doc(target.id).update({ role: "MEMBER" });
    } else {
      await adminDb.collection("organizations").doc(caller.orgId).update({ ownerId: target.id });
      // Not posted to the activity feed: the whole workspace reads it, and
      // who holds the account is kept from everyone but the holder.
      console.log(`[TeamStructure] ${caller.orgId}: account handed from ${caller.uid} to ${target.id}`);
      return { success: true };
    }

    await logActivity({
      eventType: "OWNERSHIP_CHANGED",
      orgId: caller.orgId,
      projectId: null,
      actor: { uid: caller.uid, name: caller.name },
      metadata: { change, targetUserId: target.id, memberName: target.name },
    });

    return { success: true };
  } catch (err) {
    console.error(`[TeamStructure] Ownership ${change} failed:`, err);
    return { success: false, error: "Could not change ownership. Try again." };
  }
}

export async function promoteToOwnerAction(input: { targetUid: string }): Promise<Result> {
  return changeOwnership("promote", input.targetUid);
}

export async function removeOwnerRoleAction(input: { targetUid: string }): Promise<Result> {
  return changeOwnership("demote", input.targetUid);
}

export async function transferMainOwnerAction(input: { targetUid: string }): Promise<Result> {
  return changeOwnership("transfer", input.targetUid);
}

/* ------------------------------------------------------------------ */
/*  Departments: any owner                                             */
/* ------------------------------------------------------------------ */

function nameTaken(departments: Department[], name: string, exceptId?: string) {
  const wanted = name.toLowerCase();
  return departments.some((d) => d.id !== exceptId && d.name.toLowerCase() === wanted);
}

export async function createDepartmentAction(input: {
  name: string;
  leadTitle?: string;
}): Promise<Result> {
  const caller = await requireOwner();
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
      leadTitle: title.title,
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
}): Promise<Result> {
  const caller = await requireOwner();
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

    await found.ref.update({ name: parsed.name, leadTitle: title.title });
    return { success: true };
  } catch (err) {
    console.error("[TeamStructure] Rename department failed:", err);
    return { success: false, error: "Could not rename the department. Try again." };
  }
}

/** Deletes the department. Its people stay in the workspace, unassigned. */
export async function deleteDepartmentAction(input: { departmentId: string }): Promise<Result> {
  const caller = await requireOwner();
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
  const caller = await requireOwner();
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

/** Makes a member of the department its lead, or clears the lead with `memberUid: null`. */
export async function setDepartmentLeadAction(input: {
  departmentId: string;
  memberUid: string | null;
}): Promise<Result> {
  const caller = await requireOwner();
  if (!caller.ok) return { success: false, error: caller.error };

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
