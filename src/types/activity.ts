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
  /* Edits, notes and blocking are not status changes. They used to be
     logged as DIRECTIVE_TRANSITION with placeholder from/to strings,
     which rendered in the feed as "shifted X to Updated". */
  | "DIRECTIVE_EDITED"
  | "DIRECTIVE_BLOCKED"
  | "DIRECTIVE_UNBLOCKED"
  | "NOTE_ADDED"
  | "MILESTONE_COMPLETE"
  | "PROJECT_TERMINATED"
  | "PROJECT_ARCHIVED"
  | "PROJECT_RESTORED"
  | "PROJECT_RENAMED"
  | "PROJECT_DESCRIPTION_UPDATED"
  | "STATUS_TRANSITION"
  | "BRIEFING_POSTED"
  | "MEMBER_REMOVED"
  | "DIRECTIVE_DELETED"
  | "WORKLOAD_SHIFT"
  /* Engagements are time with people in it — a separate collection from
     directives, and separate events so the feed can distinguish "the
     work moved" from "the meeting moved". */
  | "ENGAGEMENT_SCHEDULED"
  | "ENGAGEMENT_REVISED"
  | "ENGAGEMENT_CANCELLED"
  | "RSVP_RECORDED";

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
