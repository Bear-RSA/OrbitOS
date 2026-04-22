import { Timestamp } from "firebase/firestore";

/* ------------------------------------------------------------------ */
/*  Activity Event Types                                               */
/* ------------------------------------------------------------------ */

export type ActivityEventType =
  | "SYSTEM_BOOT"
  | "INVITE_DISPATCHED"
  | "DIRECTIVE_TRANSITION"
  | "ASSET_INGESTED"
  | "ASSET_DESTROYED"
  | "DIRECTIVE_CREATED"
  | "DIRECTIVE_ASSIGNED"
  | "MILESTONE_COMPLETE"
  | "PROJECT_TERMINATED"
  | "STATUS_TRANSITION"
  | "BRIEFING_POSTED"
  | "MEMBER_REMOVED"
  | "DIRECTIVE_DELETED";

/* ------------------------------------------------------------------ */
/*  Activity Document                                                  */
/* ------------------------------------------------------------------ */

export interface ActivityEvent {
  id: string;
  eventType: ActivityEventType;
  projectId: string | null;
  orgId: string;
  actor: {
    uid: string;
    name: string;
    role?: "OWNER" | "MEMBER" | string;
  };
  metadata: {
    fileName?: string;
    taskTitle?: string;
    email?: string;
    [key: string]: any;
  };
  timestamp: Timestamp;
}
