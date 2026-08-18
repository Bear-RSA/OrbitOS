"use server";

import { logActivity } from "@/lib/telemetry";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/lib/auth/session";
import { verifyProjectAccess } from "@/lib/auth/permissions";
import type { ActivityEventType } from "@/types/activity";

/* ------------------------------------------------------------------ */
/*  Telemetry write path                                               */
/*                                                                     */
/*  This action used to take `actor` and `orgId` straight from the     */
/*  browser and write them through. Both are unverified claims: any    */
/*  signed-in user could forge log entries under someone else's name,  */
/*  or write into another workspace's log entirely. The telemetry log  */
/*  is an audit trail, so its attribution has to come from the session */
/*  and nowhere else.                                                  */
/*                                                                     */
/*  `actor` and `orgId` remain in the signature so existing call sites */
/*  keep compiling, but they are ignored — everything is re-derived    */
/*  server-side from the verified caller.                              */
/* ------------------------------------------------------------------ */

interface RecordTelemetryInput {
  eventType: ActivityEventType;
  projectId?: string | null;
  metadata?: Record<string, any>;
  /** @deprecated Ignored — the caller's identity comes from the session. */
  actor?: { uid: string; name: string };
  /** @deprecated Ignored — resolved from the caller's user record. */
  orgId?: string;
}

export async function recordTelemetryAction({
  eventType,
  projectId = null,
  metadata = {},
}: RecordTelemetryInput): Promise<{ success: boolean; error?: string }> {
  const session = await getServerSession();
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  const userSnap = await adminDb.collection("users").doc(session.uid).get();
  const userData = userSnap.data();
  if (!userData?.orgId) {
    return { success: false, error: "No workspace assigned" };
  }

  // A projectId is a target the client chose, so it needs the same
  // membership check the read path applies before it is written into a log.
  if (projectId) {
    const access = await verifyProjectAccess(session.uid, projectId);
    if (!access.hasAccess) {
      return { success: false, error: "Forbidden" };
    }
  }

  await logActivity({
    eventType,
    orgId: userData.orgId,
    projectId,
    actor: { uid: session.uid, name: userData.name || "Operator" },
    metadata,
  });

  return { success: true };
}
