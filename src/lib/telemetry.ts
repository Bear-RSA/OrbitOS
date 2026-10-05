import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import type { ActivityEventType } from "@/types/activity";
import { formatTelemetryLine } from "@/lib/telemetry/console-line";

/* ------------------------------------------------------------------ */
/*  Telemetry — Activity Logger                                        */
/*                                                                     */
/*  Writes structured events to the `activity` collection.             */
/*  All calls are non-blocking (fire-and-forget with error logging).   */
/*  The console line format lives in ./telemetry/console-line.ts.      */
/* ------------------------------------------------------------------ */

const ACTIVITY_COLLECTION = "activity";

interface LogActivityParams {
  eventType: ActivityEventType;
  orgId: string;
  projectId?: string | null;
  actor: { uid: string; name: string };
  metadata?: Record<string, any>;
}

/**
 * Logs a system-level activity event to Firestore and prints one
 * human-readable console line per event.
 */
export async function logActivity({
  eventType,
  orgId,
  projectId = null,
  actor,
  metadata = {},
}: LogActivityParams): Promise<void> {
  try {
    // Update user heartbeat
    try {
      await adminDb.collection("users").doc(actor.uid).update({
        lastActivity: FieldValue.serverTimestamp()
      });
    } catch (e) {
      console.warn(`[Heartbeat] Failed for ${actor.uid}`);
    }

    // Persist event to network log
    const docRef = await adminDb.collection(ACTIVITY_COLLECTION).add({
      eventType,
      orgId,
      projectId,
      actor: {
        uid: actor.uid,
        name: actor.name,
      },
      metadata,
      timestamp: FieldValue.serverTimestamp(),
    });

    console.log(
      `[Telemetry] ${formatTelemetryLine({ eventType, actor, projectId, metadata, docId: docRef.id })}`,
    );
  } catch (err) {
    console.error(
      `[Telemetry] WRITE FAILED ${formatTelemetryLine({ eventType, actor, projectId, metadata })}`,
      err,
    );
  }
}
