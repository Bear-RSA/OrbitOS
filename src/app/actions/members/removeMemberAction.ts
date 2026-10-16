"use server";

import { adminDb } from "@/lib/firebase/admin";
import { validateOwner } from "@/lib/auth/permissions";
import { loadInternalManagementIds } from "@/lib/internal-management/store";
import { normaliseRole } from "@/lib/members/rank";
import { removeFromWorkspace } from "@/lib/members/remove";
import { requireServerUid } from "@/lib/auth/session";

/* ------------------------------------------------------------------ */
/*  Remove Member — server action                                      */
/*  Atomically removes a user from the org and unassigns their tasks   */
/*  within the specified project. Owner-only operation.                */
/*                                                                     */
/*  The caller used to name themselves in the payload, and the OWNER   */
/*  check below ran against that name. Owner uids are not secret —     */
/*  they sit in member lists and activity logs — so any signed-in user */
/*  could borrow one and evict people from that workspace. The uid now */
/*  comes from the session; `uid` stays in the payload so existing     */
/*  call sites keep compiling, and is ignored.                         */
/* ------------------------------------------------------------------ */

interface RemoveMemberPayload {
  projectId?: string;
  targetUserId: string;
  /** @deprecated Ignored — the caller's identity comes from the session. */
  uid?: string;
}

interface RemoveMemberResult {
  success: boolean;
  error?: string;
}

export async function removeMemberAction(
  payload: RemoveMemberPayload
): Promise<RemoveMemberResult> {
  const { projectId, targetUserId } = payload;

  try {
    let uid: string;
    try {
      uid = await requireServerUid();
    } catch {
      return { success: false, error: "Your session has expired. Sign in again." };
    }

    // 1. Validate caller is OWNER and scope is valid
    const authStatus = await validateOwner(uid, targetUserId, projectId);
    if (!authStatus.isOwner) {
      return { success: false, error: authStatus.error ?? "Only the workspace owner can do this." };
    }
    const callerOrgId = authStatus.orgId!;

    // 2. Prevent owner from removing themselves
    if (targetUserId === uid) {
      return { success: false, error: "You can't remove yourself from the workspace." };
    }

    // 3. Fetch target user to prevent removing another OWNER
    const targetSnap = await adminDb.collection("users").doc(targetUserId).get();
    if (!targetSnap.exists) {
      return { success: false, error: "Target user not found." };
    }
    const targetData = targetSnap.data()!;
    
    // Owners, and anyone in Internal Management, answer only to Internal
    // Management. The last one of it can't be removed at all.
    const imIds = await loadInternalManagementIds(callerOrgId);
    const targetIsOwner = normaliseRole(targetData.role) === "OWNER";
    const targetInIm = imIds.includes(targetUserId);
    if ((targetIsOwner || targetInIm) && !imIds.includes(uid)) {
      return {
        success: false,
        error: targetIsOwner
          ? "Only Internal Management can remove an owner."
          : "Only Internal Management can remove this person.",
      };
    }
    if (targetInIm && imIds.length <= 1) {
      return {
        success: false,
        error: "They're the last person in Internal Management. Add someone else first.",
      };
    }

    const targetName = targetData.name || "A former member";
    const callerSnap = await adminDb.collection("users").doc(uid).get();
    const callerName = callerSnap.exists ? callerSnap.data()!.name || "Unnamed member" : "System";

    // 4. Remove membership, unassign their tasks, log it
    await removeFromWorkspace({
      orgId: callerOrgId,
      targetUid: targetUserId,
      targetName,
      targetInInternalManagement: targetInIm,
      actor: { uid, name: callerName },
      projectId,
    });

    return { success: true };
  } catch (error: any) {
    console.error("[Remove Member Error]:", error);
    return { success: false, error: "Failed to remove member. Please try again." };
  }
}
