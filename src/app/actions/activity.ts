"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireServerUid } from "@/lib/auth/session";
import { DashboardActivityItem } from "@/types/dashboard";

/* ------------------------------------------------------------------ */
/*  Org Activity Log                                                   */
/*                                                                     */
/*  Read through the Admin SDK, deliberately.                          */
/*                                                                     */
/*  `activity` has no rule in firestore.rules, so it falls through to  */
/*  the deny-all at the bottom of the file. The client SDK cannot read */
/*  it — `subscribeToOrgActivity` in lib/queries/activity.ts will      */
/*  always be refused, and nothing on the dashboard may use it.        */
/*                                                                     */
/*  The other candidate, /api/telemetry/stream, is project-scoped and  */
/*  metered by resolveLiveStreamLimit. Pointing the dashboard at it    */
/*  would open a second persistent connection per user per session and */
/*  charge it against the live-stream tier limit. A poll on refresh is */
/*  enough for a log nobody watches in real time, and costs nothing    */
/*  against that quota.                                                */
/* ------------------------------------------------------------------ */

/** Matches the client-side memory ceiling used by the SSE feed. */
const MAX_ITEMS = 50;

/**
 * Serializes one activity doc for the client.
 *
 * Firestore Timestamps do not survive a server-action boundary, so the
 * timestamp crosses as an ISO string and the UI parses it back.
 */
function serialize(id: string, data: FirebaseFirestore.DocumentData): DashboardActivityItem {
  const ts = data.timestamp;
  let iso: string | null = null;
  if (ts) {
    if (typeof ts.toDate === "function") iso = ts.toDate().toISOString();
    else if (ts.seconds) iso = new Date(ts.seconds * 1000).toISOString();
  }

  return {
    id,
    eventType: data.eventType ?? "UNKNOWN",
    projectId: data.projectId ?? null,
    actorName: data.actor?.name ?? "Unknown operative",
    metadata: data.metadata ?? {},
    timestamp: iso,
  };
}

/**
 * The most recent activity for the caller's own org.
 *
 * The org is resolved from the verified session rather than taken as an
 * argument: an orgId passed in from the browser is an unverified claim,
 * and this returns other people's task titles and file names.
 */
export async function getOrgActivityAction(
  limit = MAX_ITEMS
): Promise<{ success: boolean; items: DashboardActivityItem[]; error?: string }> {
  try {
    const uid = await requireServerUid();

    const userSnap = await adminDb.collection("users").doc(uid).get();
    const orgId = userSnap.data()?.orgId;
    if (!orgId) {
      return { success: false, items: [], error: "No workspace resolved for this account." };
    }

    const snap = await adminDb
      .collection("activity")
      .where("orgId", "==", orgId)
      .orderBy("timestamp", "desc")
      .limit(Math.min(Math.max(limit, 1), MAX_ITEMS))
      .get();

    return { success: true, items: snap.docs.map((d) => serialize(d.id, d.data())) };
  } catch (err) {
    // A missing (orgId, timestamp) composite index surfaces here. The feed
    // is supplementary — the dashboard renders without it rather than
    // failing the whole load.
    console.error("[getOrgActivityAction]", err);
    return { success: false, items: [], error: "Activity log unavailable." };
  }
}
