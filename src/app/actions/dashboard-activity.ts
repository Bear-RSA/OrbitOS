"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireCaller } from "@/lib/auth/caller";

/* ------------------------------------------------------------------ */
/*  Recent activity for the dashboard                                  */
/*                                                                     */
/*  The `activity` collection is deny-all in firestore.rules, and the  */
/*  SSE route only streams one project at a time. The dashboard wants  */
/*  the last few things that happened anywhere in the workspace, read  */
/*  once per load, not a live socket per project.                      */
/*                                                                     */
/*  The org comes from the session, never the payload, and the query   */
/*  is scoped to that org's projects. Only project events are read:    */
/*  org-wide entries (Vault filing, clearance, ownership) carry no     */
/*  projectId and stay out of a panel every seat can see.              */
/*                                                                     */
/*  `projectId in [...]` + `orderBy(timestamp)` rides the existing     */
/*  projectId/timestamp index, so this needs no new index deploy.      */
/*  Firestore caps `in` at 30 values; the 30 newest projects cover any */
/*  workspace this panel is meant for.                                 */
/* ------------------------------------------------------------------ */

/** Firestore's ceiling on values in one `in` filter. */
const IN_LIMIT = 30;

/** Hard ceiling on documents read per call, whatever the client asks. */
const MAX_EVENTS = 12;

export interface DashboardActivityEvent {
  id: string;
  eventType: string;
  projectId: string;
  projectName: string;
  actorUid: string;
  actorName: string;
  metadata: Record<string, any>;
  /** ISO string, or null while the server timestamp is pending. */
  timestamp: string | null;
}

/**
 * Metadata is free-form and can hold Firestore Timestamps, which a server
 * action cannot hand to the client. Dates become ISO strings; everything
 * else passes through as JSON would.
 */
function plain(value: Record<string, any>): Record<string, any> {
  return JSON.parse(
    JSON.stringify(value, (_key, v) =>
      v && typeof v === "object" && typeof v.toDate === "function" ? v.toDate().toISOString() : v
    )
  );
}

export async function getRecentActivityAction(
  count = 8
): Promise<{ success: true; events: DashboardActivityEvent[] } | { success: false; error: string }> {
  const caller = await requireCaller();
  if (!caller.ok) return { success: false, error: caller.error };

  try {
    const projectsSnap = await adminDb
      .collection("projects")
      .where("orgId", "==", caller.orgId)
      .limit(IN_LIMIT)
      .get();

    if (projectsSnap.empty) return { success: true, events: [] };

    const projectName = new Map(
      projectsSnap.docs.map((doc) => [doc.id, (doc.data().name as string) || "Untitled project"])
    );

    const activitySnap = await adminDb
      .collection("activity")
      .where("projectId", "in", Array.from(projectName.keys()))
      .orderBy("timestamp", "desc")
      .limit(Math.max(1, Math.min(count, MAX_EVENTS)))
      .get();

    const events = activitySnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        eventType: data.eventType as string,
        projectId: data.projectId as string,
        projectName: projectName.get(data.projectId) ?? "Unknown project",
        actorUid: data.actor?.uid ?? "",
        actorName: data.actor?.name ?? "Someone",
        metadata: plain(data.metadata ?? {}),
        timestamp: data.timestamp?.toDate?.().toISOString() ?? null,
      };
    });

    return { success: true, events };
  } catch (error) {
    console.error("[Dashboard activity] read failed:", error);
    return { success: false, error: "Recent activity could not be loaded." };
  }
}
