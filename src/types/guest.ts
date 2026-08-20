import { Timestamp } from "firebase/firestore";

/* ------------------------------------------------------------------ */
/*  Guest Schema                                                       */
/*                                                                     */
/*  A guest is a person who has been invited to an engagement but has  */
/*  no OrbitOS account. They exist as a record rather than as a loose  */
/*  email string on the engagement, because the workspace has to be    */
/*  able to say things about them: who they are, which engagements     */
/*  they are on, and whether they answered. An email in an array can   */
/*  answer none of that.                                               */
/*                                                                     */
/*  Guests are org-scoped. The same address invited from two different */
/*  workspaces is two records — one workspace's client list is not     */
/*  another's, and merging them would leak the association.            */
/*                                                                     */
/*  A guest is NOT a member. They hold no seat, count against no seat  */
/*  limit, can sign in to nothing, and can read only the single        */
/*  engagement their signed link names.                                */
/* ------------------------------------------------------------------ */

export interface OrbitGuest {
  /** `g_<hash of orgId + email>` — deterministic, so re-inviting the same
      address reuses the record instead of forking a second identity. */
  id: string;
  orgId: string;
  /** Normalized: trimmed and lowercased. The identity key. */
  email: string;
  /** What to call them. Falls back to the address's local part. */
  name: string;

  /**
   * Set once this address signs up and joins the org. From then on the
   * guest record is a forwarding pointer kept for historical engagements
   * rather than a live identity — new invites resolve to the account.
   */
  linkedUid: string | null;

  /**
   * Bumped to revoke every RSVP link issued to this guest so far. Same
   * contract as `calendarFeedVersion` on a user: the signed link carries
   * the version, and a mismatch is indistinguishable from a bad token.
   */
  tokenVersion: number;

  /** uid of whoever first brought them into the workspace. */
  invitedBy: string;
  /** Cheap "have we contacted this person recently" without a log scan. */
  lastInvitedAt: Timestamp | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** What the create dialog sends for one off-platform invitee. */
export interface GuestInviteInput {
  email: string;
  name?: string;
}

/**
 * A participant flattened for display, so the UI does not branch on
 * member-vs-guest at every render site.
 */
export interface ParticipantView {
  id: string;
  name: string;
  email: string | null;
  kind: "member" | "guest";
  rsvp: "pending" | "accepted" | "declined" | "tentative";
  photoURL?: string | null;
}
