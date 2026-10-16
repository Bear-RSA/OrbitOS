import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { requireCaller, type Caller } from "@/lib/auth/caller";
import { billingGuardrailsEnabled, resolveOrgTier } from "@/lib/auth/permissions";
import { loadAccountHolderId } from "@/lib/members/account-holder";
import { TIER_DEFINITIONS } from "@/types/subscription";

import { ADMIN_LOCKED_ERROR, effectiveSeatLimit } from "./rules";

/* ------------------------------------------------------------------ */
/*  Internal Management, read on the server                            */
/*                                                                     */
/*  `internal_management/{orgId}` holds the member list, the Admin     */
/*  Tools passcode hash and any sold seat override. Its unlocks sit    */
/*  under it at `unlocks/{uid}`. The rules' catch-all denies every     */
/*  client, which is the point: the organization document is readable  */
/*  by the whole workspace, and who is in Internal Management is kept   */
/*  from everyone outside it.                                           */
/* ------------------------------------------------------------------ */

const COLLECTION = "internal_management";

export function internalManagementDoc(orgId: string) {
  return adminDb.collection(COLLECTION).doc(orgId);
}

export function adminUnlockDoc(orgId: string, uid: string) {
  return internalManagementDoc(orgId).collection("unlocks").doc(uid);
}

/**
 * Everyone in Internal Management.
 *
 * A workspace that has never saved a list gets its old account holder as
 * the only member. Nothing is written here, so a read never races a
 * change; the first change saves the list.
 */
export async function loadInternalManagementIds(orgId: string): Promise<string[]> {
  const snap = await internalManagementDoc(orgId).get();
  const saved = snap.data()?.members;
  if (Array.isArray(saved) && saved.length > 0) {
    return saved.filter((id): id is string => typeof id === "string");
  }

  const holder = await loadAccountHolderId(orgId);
  return holder ? [holder] : [];
}

export async function isInternalManagement(orgId: string, uid: string): Promise<boolean> {
  return (await loadInternalManagementIds(orgId)).includes(uid);
}

/** Seats this workspace has: the plan's, or a sold override. */
export async function loadSeatLimit(orgId: string): Promise<number> {
  const [snap, tier] = await Promise.all([internalManagementDoc(orgId).get(), resolveOrgTier(orgId)]);
  const override = snap.data()?.seatOverride;

  return effectiveSeatLimit({
    tierLimit: TIER_DEFINITIONS[tier].limits.maxInternalManagement,
    override: typeof override === "number" ? override : null,
    enforced: billingGuardrailsEnabled(),
  });
}

/** When this person's Admin Tools unlock runs out, or null if it is locked. */
export async function loadAdminUnlockedUntil(orgId: string, uid: string): Promise<Date | null> {
  try {
    const until = (await adminUnlockDoc(orgId, uid).get()).data()?.unlockedUntil;
    const date: Date | null = until?.toDate ? until.toDate() : null;
    return date && date.getTime() > Date.now() ? date : null;
  } catch (err) {
    console.error("[AdminTools] Could not check unlock state:", err);
    return null;
  }
}

/** The caller, required to be in Internal Management. */
export async function requireInternalManagement(): Promise<Caller> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  if (!(await isInternalManagement(caller.orgId, caller.uid))) {
    return { ok: false, error: "Only Internal Management can do this." };
  }
  return caller;
}

/**
 * The caller, in Internal Management with Admin Tools unlocked.
 *
 * Every Admin Tools action goes through this. The passcode screen alone
 * is a page the browser shows; this is the check that holds.
 */
export async function requireAdminTools(): Promise<Caller> {
  const caller = await requireInternalManagement();
  if (!caller.ok) return caller;
  if (!(await loadAdminUnlockedUntil(caller.orgId, caller.uid))) {
    return { ok: false, error: ADMIN_LOCKED_ERROR };
  }
  return caller;
}

/**
 * Takes someone leaving the workspace out of Internal Management, and
 * closes their Admin Tools. For `removeMemberAction`, after its own checks.
 * Lives here rather than in an action file so no client can call it.
 */
export async function dropFromInternalManagement(orgId: string, uid: string): Promise<void> {
  await internalManagementDoc(orgId).set({ members: FieldValue.arrayRemove(uid) }, { merge: true });
  await adminUnlockDoc(orgId, uid).delete();
}
