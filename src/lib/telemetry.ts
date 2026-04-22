import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import type { ActivityEventType } from "@/types/activity";

/* ------------------------------------------------------------------ */
/*  Telemetry — Activity Logger                                        */
/*                                                                     */
/*  Writes structured events to the `activity` collection.             */
/*  All calls are non-blocking (fire-and-forget with error logging).   */
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
 * Logs a system-level activity event to Firestore and standardizes console output.
 */
export async function logActivity({
  eventType,
  orgId,
  projectId = null,
  actor,
  metadata = {},
}: LogActivityParams): Promise<void> {
  try {
    // Standardized console telemetry output
    const timestamp = new Date();
    const timeStr = timestamp.toLocaleTimeString('en-GB', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
    
    // Details construction for console log
    const detailsArr = [];
    if (metadata.fileName) detailsArr.push(`file:${metadata.fileName}`);
    if (metadata.taskTitle) detailsArr.push(`task:${metadata.taskTitle}`);
    if (metadata.email) detailsArr.push(`email:${metadata.email}`);
    const details = detailsArr.length > 0 ? ` - ${detailsArr.join(', ')}` : "";

    console.log(`[Telemetry] Broadcast Initiated: ${eventType} | Project: ${projectId}`);
    
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

    console.log(`[Telemetry] Signal Locked: ${docRef.id}`);
  } catch (err) {
    console.error(`[Telemetry] SIGNAL_LOST during ${eventType}:`, err);
  }
}
