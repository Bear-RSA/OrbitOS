import { adminDb } from "@/lib/firebase/admin";
import { resolvePrimaryOwnerId } from "@/lib/members/hierarchy";

/**
 * The account holder's uid for this workspace, read on the server.
 *
 * Same answer `actions/team-structure` gives: the organization's
 * `ownerId` while that person is still an owner, the earliest owner
 * otherwise. Never sent to anybody but the account holder themselves.
 */
export async function loadAccountHolderId(orgId: string): Promise<string | null> {
  const [orgSnap, ownersSnap] = await Promise.all([
    adminDb.collection("organizations").doc(orgId).get(),
    adminDb
      .collection("users")
      .where("orgId", "==", orgId)
      .where("role", "==", "OWNER")
      .get(),
  ]);

  const owners = ownersSnap.docs.map((doc) => ({
    id: doc.id,
    createdAtMillis: doc.data().createdAt?.toMillis?.() ?? 0,
  }));

  return resolvePrimaryOwnerId(orgSnap.data()?.ownerId, owners);
}
