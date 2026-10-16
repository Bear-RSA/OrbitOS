"use server";

import { createHash, randomBytes } from "crypto";
import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { requireCaller } from "@/lib/auth/caller";
import { resolveOrgTier, resolveRankLimits, validateTierQuota } from "@/lib/auth/permissions";
import {
  sendAdminPasscodeResetEmail,
  sendInternalManagementChangeEmail,
} from "@/lib/email/sendInternalManagementEmail";
import {
  ADMIN_UNLOCK_MS,
  checkMembershipChange,
  isValidAdminPasscode,
} from "@/lib/internal-management/rules";
import {
  adminUnlockDoc,
  internalManagementDoc,
  isInternalManagement,
  loadAdminUnlockedUntil,
  loadInternalManagementIds,
  loadSeatLimit,
  requireAdminTools,
  requireInternalManagement,
} from "@/lib/internal-management/store";
import { memberDisplayName } from "@/lib/members/profile";
import { checkAdminRankChange, normaliseRole, STORED_ROLES, type RankLimits, type StoredRole } from "@/lib/members/rank";
import { logActivity } from "@/lib/telemetry";
import { getAppUrl } from "@/lib/utils/getAppUrl";
import { hashPasscode, safeEqualHex, verifyPasscode } from "@/lib/vault/passcode";
import {
  claimAdminPasscodeAttempt,
  claimAdminPasscodeResetRequest,
  clearAdminPasscodeAttempts,
  HARD_MAX_ATTEMPTS_PER_WINDOW,
} from "@/lib/vault/passcode-throttle";
import { TIER_DEFINITIONS } from "@/types/subscription";

/* ------------------------------------------------------------------ */
/*  Admin Tools                                                        */
/*                                                                     */
/*  Internal Management's own screen, behind its own passcode. The     */
/*  passcode works like the Vault's: a correct entry writes an unlock  */
/*  with an expiry, and every action below checks that unlock on the   */
/*  server through `requireAdminTools`, so the screen is never the     */
/*  only thing standing in the way.                                    */
/*                                                                     */
/*  Nothing here goes to the workspace activity feed except rank       */
/*  changes, which the whole workspace already sees on the avatars.    */
/*  Who is in Internal Management is kept from everyone outside it.    */
/* ------------------------------------------------------------------ */

const USERS = "users";
const DEPARTMENTS = "departments";
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

type Result<T = object> = ({ success: true } & T) | { success: false; error: string };

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function unlockFor(orgId: string, uid: string) {
  await adminUnlockDoc(orgId, uid).set({
    unlockedUntil: Timestamp.fromMillis(Date.now() + ADMIN_UNLOCK_MS),
  });
}

/* ------------------------------------------------------------------ */
/*  Status and passcode                                                */
/* ------------------------------------------------------------------ */

export interface AdminToolsStatus {
  /** The viewer is in Internal Management. Everyone else sees nothing more. */
  member: boolean;
  passcodeSet: boolean;
  /** Epoch ms the unlock runs out, or null while locked. */
  unlockedUntil: number | null;
}

/** Any signed-in member may ask. Only Internal Management learns more than "no". */
export async function getAdminToolsStatusAction(): Promise<Result<{ status: AdminToolsStatus }>> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    if (!(await isInternalManagement(caller.orgId, caller.uid))) {
      return { success: true, status: { member: false, passcodeSet: false, unlockedUntil: null } };
    }

    const [snap, until] = await Promise.all([
      internalManagementDoc(caller.orgId).get(),
      loadAdminUnlockedUntil(caller.orgId, caller.uid),
    ]);

    return {
      success: true,
      status: {
        member: true,
        passcodeSet: Boolean(snap.data()?.passcodeHash),
        unlockedUntil: until ? until.getTime() : null,
      },
    };
  } catch (err) {
    console.error("[AdminTools] Could not read status:", err);
    return { success: false, error: "Could not check Admin Tools." };
  }
}

/**
 * Who wears the IM badge. Only Internal Management is told; for everyone
 * else the list is empty, so no browser outside it ever holds the names.
 * No passcode needed: the badge says who, not what they can do.
 */
export async function getInternalManagementBadgesAction(): Promise<Result<{ ids: string[] }>> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const ids = await loadInternalManagementIds(caller.orgId);
    return { success: true, ids: ids.includes(caller.uid) ? ids : [] };
  } catch (err) {
    console.error("[AdminTools] Could not load the IM badges:", err);
    return { success: true, ids: [] };
  }
}

/**
 * Sets the passcode. The first one can be set by anyone in Internal
 * Management; changing it after that needs Admin Tools already open.
 */
export async function setAdminPasscodeAction(code: string): Promise<Result> {
  const caller = await requireInternalManagement();
  if (!caller.ok) return { success: false, error: caller.error };
  if (!isValidAdminPasscode(code)) return { success: false, error: "The passcode must be exactly 6 digits." };

  try {
    const snap = await internalManagementDoc(caller.orgId).get();
    if (snap.data()?.passcodeHash && !(await loadAdminUnlockedUntil(caller.orgId, caller.uid))) {
      return { success: false, error: "Open Admin Tools with the current passcode before changing it." };
    }

    const { hash, salt } = hashPasscode(code);
    await internalManagementDoc(caller.orgId).set(
      {
        passcodeHash: hash,
        salt,
        setBy: caller.uid,
        setAt: new Date(),
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      },
      { merge: true }
    );
    await unlockFor(caller.orgId, caller.uid);
    return { success: true };
  } catch (err) {
    console.error("[AdminTools] Could not set the passcode:", err);
    return { success: false, error: "Could not save the passcode. Try again." };
  }
}

export async function verifyAdminPasscodeAction(code: string): Promise<Result> {
  const caller = await requireInternalManagement();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const data = (await internalManagementDoc(caller.orgId).get()).data();
    if (!data?.passcodeHash || !data?.salt) {
      return { success: false, error: "No passcode is set yet. Set one first." };
    }
    if (!isValidAdminPasscode(code)) return { success: false, error: "Enter all 6 digits." };

    const verdict = await claimAdminPasscodeAttempt(caller.uid, caller.orgId);
    if (verdict === "locked") return { success: false, error: "Too many attempts. Try again in 15 minutes." };
    if (verdict === "unavailable") {
      return { success: false, error: "Could not check the passcode right now. Try again shortly." };
    }

    if (!verifyPasscode(code, data.passcodeHash as string, data.salt as string)) {
      return {
        success: false,
        error: `That passcode isn't right. You get ${HARD_MAX_ATTEMPTS_PER_WINDOW} tries every 15 minutes.`,
      };
    }

    await clearAdminPasscodeAttempts(caller.uid, caller.orgId);
    await unlockFor(caller.orgId, caller.uid);
    return { success: true };
  } catch (err) {
    console.error("[AdminTools] Could not verify the passcode:", err);
    return { success: false, error: "Could not check the passcode right now." };
  }
}

/** Closes Admin Tools now rather than waiting out the 15 minutes. */
export async function lockAdminToolsAction(): Promise<Result> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };
  try {
    await adminUnlockDoc(caller.orgId, caller.uid).delete();
    return { success: true };
  } catch (err) {
    console.error("[AdminTools] Could not lock:", err);
    return { success: false, error: "Could not lock Admin Tools." };
  }
}

/** Emails a reset link to the person asking. Three a day per workspace. */
export async function requestAdminPasscodeResetAction(): Promise<Result> {
  const caller = await requireInternalManagement();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const verdict = await claimAdminPasscodeResetRequest(caller.orgId);
    if (verdict === "locked") return { success: false, error: "Too many reset requests today. Try again tomorrow." };
    if (verdict === "unavailable") {
      return { success: false, error: "Could not send a reset right now. Try again shortly." };
    }

    const email = (await adminDb.collection(USERS).doc(caller.uid).get()).data()?.email as string | undefined;
    if (!email) return { success: false, error: "Your account has no email on file." };

    const token = randomBytes(32).toString("hex");
    await internalManagementDoc(caller.orgId).set(
      {
        resetTokenHash: hashToken(token),
        resetTokenExpiresAt: Timestamp.fromMillis(Date.now() + RESET_TOKEN_TTL_MS),
      },
      { merge: true }
    );

    const link = new URL("/admin", getAppUrl());
    link.searchParams.set("reset", token);

    const sent = await sendAdminPasscodeResetEmail({ email, resetLink: link.toString() });
    if (!sent.success) {
      console.error("[AdminTools] Reset email failed:", sent.error);
      return { success: false, error: "Could not send the reset email. Try again shortly." };
    }
    return { success: true };
  } catch (err) {
    console.error("[AdminTools] Could not request a reset:", err);
    return { success: false, error: "Could not send a reset right now." };
  }
}

/** Sets a new passcode from an emailed link, and opens Admin Tools. */
export async function resetAdminPasscodeAction(token: string, newCode: string): Promise<Result> {
  const caller = await requireInternalManagement();
  if (!caller.ok) return { success: false, error: caller.error };
  if (!isValidAdminPasscode(newCode)) return { success: false, error: "The passcode must be exactly 6 digits." };

  try {
    const data = (await internalManagementDoc(caller.orgId).get()).data();
    const expiresAt: Date | null = data?.resetTokenExpiresAt?.toDate?.() ?? null;
    if (!data?.resetTokenHash || !expiresAt || typeof token !== "string") {
      return { success: false, error: "This reset link is invalid. Request a new one." };
    }
    if (expiresAt.getTime() < Date.now()) {
      return { success: false, error: "This reset link has expired. Request a new one." };
    }
    if (!safeEqualHex(hashToken(token), data.resetTokenHash as string)) {
      return { success: false, error: "This reset link is invalid. Request a new one." };
    }

    const { hash, salt } = hashPasscode(newCode);
    await internalManagementDoc(caller.orgId).set(
      {
        passcodeHash: hash,
        salt,
        setBy: caller.uid,
        setAt: new Date(),
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      },
      { merge: true }
    );
    await clearAdminPasscodeAttempts(caller.uid, caller.orgId);
    await unlockFor(caller.orgId, caller.uid);
    return { success: true };
  } catch (err) {
    console.error("[AdminTools] Could not reset the passcode:", err);
    return { success: false, error: "Could not reset the passcode." };
  }
}

/* ------------------------------------------------------------------ */
/*  Overview                                                           */
/* ------------------------------------------------------------------ */

export interface AdminPerson {
  id: string;
  name: string;
  email: string;
  photoURL: string | null;
  role: StoredRole;
  leadsDepartment: boolean;
}

export interface AdminOverview {
  workspaceName: string;
  planName: string;
  people: AdminPerson[];
  internalManagementIds: string[];
  seatLimit: number;
  rankLimits: RankLimits;
  /** -1 = the plan does not limit Owners. */
  ownerLimit: number;
}

export async function getAdminOverviewAction(): Promise<Result<{ overview: AdminOverview }>> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const [orgSnap, usersSnap, departmentsSnap, ids, seatLimit, rankLimits, tier] = await Promise.all([
      adminDb.collection("organizations").doc(caller.orgId).get(),
      adminDb.collection(USERS).where("orgId", "==", caller.orgId).get(),
      adminDb.collection(DEPARTMENTS).where("orgId", "==", caller.orgId).get(),
      loadInternalManagementIds(caller.orgId),
      loadSeatLimit(caller.orgId),
      resolveRankLimits(caller.orgId),
      resolveOrgTier(caller.orgId),
    ]);

    const leads = new Set(departmentsSnap.docs.map((d) => d.data().leadId).filter(Boolean));
    const people: AdminPerson[] = usersSnap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: memberDisplayName({ name: data.name as string | undefined }),
          email: (data.email as string) || "",
          photoURL: (data.photoURL as string | null) ?? null,
          role: normaliseRole(data.role),
          leadsDepartment: leads.has(doc.id),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      success: true,
      overview: {
        workspaceName: (orgSnap.data()?.name as string) || "",
        planName: TIER_DEFINITIONS[tier].name,
        people,
        internalManagementIds: ids,
        seatLimit,
        rankLimits,
        ownerLimit: TIER_DEFINITIONS[tier].limits.maxOwners,
      },
    };
  } catch (err) {
    console.error("[AdminTools] Could not load the overview:", err);
    return { success: false, error: "Could not load Admin Tools." };
  }
}

/* ------------------------------------------------------------------ */
/*  Ranks: any rank, Owner included                                    */
/* ------------------------------------------------------------------ */

export async function adminSetRankAction(input: { targetUid: string; rank: StoredRole }): Promise<Result> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };
  if (!STORED_ROLES.includes(input.rank)) return { success: false, error: "That isn't a rank." };

  try {
    const [targetSnap, roleSnap, limits] = await Promise.all([
      adminDb.collection(USERS).doc(input.targetUid).get(),
      adminDb.collection(USERS).where("orgId", "==", caller.orgId).where("role", "in", ["OWNER", "owner", "EXECUTIVE"]).get(),
      resolveRankLimits(caller.orgId),
    ]);

    const data = targetSnap.data();
    const target = targetSnap.exists && data?.orgId === caller.orgId ? { id: targetSnap.id, role: data.role } : null;
    const current = normaliseRole(data?.role);
    const roles = roleSnap.docs.map((d) => ({ id: d.id, role: normaliseRole(d.data().role) }));

    const verdict = checkAdminRankChange({
      target,
      next: input.rank,
      limits,
      executiveCount: roles.filter((r) => r.role === "EXECUTIVE" && r.id !== input.targetUid).length,
      ownerCount: roles.filter((r) => r.role === "OWNER").length,
    });
    if (!verdict.ok) return { success: false, error: verdict.error };
    if (!target) return { success: false, error: "That person isn't in your workspace." };

    // Owners and members draw on separate seat allowances.
    if (input.rank === "OWNER") {
      const quota = await validateTierQuota(caller.orgId, "owners");
      if (!quota.allowed) return { success: false, error: quota.error ?? "No Owner seat is free." };
    } else if (current === "OWNER") {
      const quota = await validateTierQuota(caller.orgId, "members");
      if (!quota.allowed) {
        return { success: false, error: quota.error ?? "There's no member seat free for them on this plan." };
      }
    }

    const batch = adminDb.batch();
    if (input.rank === "OWNER") {
      // Owners sit above departments, so they leave theirs and stop leading it.
      batch.update(targetSnap.ref, { role: "OWNER", departmentId: null });
      const led = await adminDb
        .collection(DEPARTMENTS)
        .where("orgId", "==", caller.orgId)
        .where("leadId", "==", target.id)
        .get();
      for (const doc of led.docs) batch.update(doc.ref, { leadId: null });
    } else {
      batch.update(targetSnap.ref, { role: input.rank });
    }
    await batch.commit();

    const memberName = memberDisplayName({ name: data?.name as string | undefined });
    const ownership = input.rank === "OWNER" || current === "OWNER";
    await logActivity({
      eventType: ownership ? "OWNERSHIP_CHANGED" : "RANK_CHANGED",
      orgId: caller.orgId,
      projectId: null,
      actor: { uid: caller.uid, name: caller.name },
      metadata: ownership
        ? { change: input.rank === "OWNER" ? "promote" : "demote", targetUserId: target.id, memberName }
        : { rank: input.rank, previousRank: current, targetUserId: target.id, memberName },
    });

    return { success: true };
  } catch (err) {
    console.error("[AdminTools] Rank change failed:", err);
    return { success: false, error: "Could not change their rank. Try again." };
  }
}

/* ------------------------------------------------------------------ */
/*  Internal Management membership                                     */
/* ------------------------------------------------------------------ */

async function changeMembership(change: "add" | "remove", targetUid: string): Promise<Result> {
  const caller = await requireAdminTools();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const [targetSnap, before, seatLimit] = await Promise.all([
      adminDb.collection(USERS).doc(targetUid).get(),
      loadInternalManagementIds(caller.orgId),
      loadSeatLimit(caller.orgId),
    ]);
    const targetData = targetSnap.data();
    const target = targetSnap.exists && targetData?.orgId === caller.orgId ? { id: targetSnap.id } : null;

    // Saved in a transaction so two people changing the list at once
    // can't both take the last seat or both remove the second-to-last.
    const verdict = await adminDb.runTransaction(async (tx) => {
      const ref = internalManagementDoc(caller.orgId);
      const saved = (await tx.get(ref)).data()?.members;
      const members: string[] = Array.isArray(saved) && saved.length > 0 ? saved : before;

      const check = checkMembershipChange({ change, members, target, seatLimit });
      if (!check.ok) return check;

      const next = change === "add" ? [...members, targetUid] : members.filter((id) => id !== targetUid);
      tx.set(ref, { members: next, updatedAt: new Date(), updatedBy: caller.uid }, { merge: true });
      return check;
    });
    if (!verdict.ok) return { success: false, error: verdict.error };

    // Someone removed loses their open session straight away.
    if (change === "remove") await adminUnlockDoc(caller.orgId, targetUid).delete();

    // Everyone who was in it, everyone in it now, and the person changed.
    const recipients = Array.from(new Set([...before, targetUid]));
    const [orgSnap, ...recipientSnaps] = await Promise.all([
      adminDb.collection("organizations").doc(caller.orgId).get(),
      ...recipients.map((id) => adminDb.collection(USERS).doc(id).get()),
    ]);
    const emails = recipientSnaps
      .map((snap) => snap.data()?.email as string | undefined)
      .filter((email): email is string => Boolean(email));

    const sent = await sendInternalManagementChangeEmail({
      to: emails,
      change: change === "add" ? "added" : "removed",
      actorName: caller.name,
      memberName: memberDisplayName({ name: targetData?.name as string | undefined }),
      workspaceName: (orgSnap.data()?.name as string) || "",
    });
    // The change is saved either way; a failed email is logged, not undone.
    if (!sent.success) console.error("[AdminTools] Change email failed:", sent.error);

    console.log(`[AdminTools] ${caller.orgId}: ${caller.uid} ${change === "add" ? "added" : "removed"} ${targetUid}`);
    return { success: true };
  } catch (err) {
    console.error(`[AdminTools] Internal Management ${change} failed:`, err);
    return { success: false, error: "Could not change Internal Management. Try again." };
  }
}

export async function addToInternalManagementAction(input: { targetUid: string }): Promise<Result> {
  return changeMembership("add", input.targetUid);
}

export async function removeFromInternalManagementAction(input: { targetUid: string }): Promise<Result> {
  return changeMembership("remove", input.targetUid);
}
