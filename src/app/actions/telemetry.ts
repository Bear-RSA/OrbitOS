"use server";

import { logActivity } from "@/lib/telemetry";
import type { ActivityEventType } from "@/types/activity";

export async function recordTelemetryAction({
  eventType,
  orgId,
  projectId = null,
  actor,
  metadata = {},
}: {
  eventType: ActivityEventType;
  orgId: string;
  projectId?: string | null;
  actor: { uid: string; name: string };
  metadata?: Record<string, any>;
}) {
  console.log(`[TelemetryAction] Recording ${eventType} for project ${projectId}`);
  await logActivity({
    eventType,
    orgId,
    projectId,
    actor,
    metadata,
  });
}
