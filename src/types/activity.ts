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
  | "RSVP_RECORDED"
  /* A direct call is neither work nor a scheduled meeting — it leaves no
     calendar entry, so without its own event the feed has no record that
     two operatives spoke at all. Only the placing of a call is logged:
     who answered is between the two of them. */
  | "CALL_STARTED"
  /* A transcript is the one artefact here that exists because people
     agreed to it, so the feed records that it was made and by whom.
     Only the making — not who read it afterwards, and never the text,
     which would put the meeting in a second place with weaker rules. */
  | "MEETING_TRANSCRIBED"
  /* The Vault holds company records rather than project work, so its
     events carry no projectId and are org-wide. Only filing, purging
     and clearance changes are logged — not reads. A log of who opened
     the payroll register would be a second copy of the same secret. */
  | "VAULT_DOCUMENT_FILED"
  | "VAULT_DOCUMENT_PURGED"
  | "VAULT_CLEARANCE_CHANGED"
  /* The passcode gate sits in front of the whole shelf rather than one
     document, so setting or resetting it is logged the same way a
     clearance change is — it is the one action that can widen or narrow
     who is currently able to get in at all. */
  | "VAULT_PASSCODE_SET"
  | "VAULT_PASSCODE_RESET";

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
