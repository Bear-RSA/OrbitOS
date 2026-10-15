import type { ConversationType } from "@/types/message";

/* ------------------------------------------------------------------ */
/*  Message access decisions                                           */
/*                                                                     */
/*  Every "may this person read this thread, and may they write in     */
/*  it" question, as pure functions over plain values. Nothing here    */
/*  reads Firestore or knows what a session is — the actions gather    */
/*  the facts, these decide.                                           */
/*                                                                     */
/*  Split out for the same reason `lib/calls/access` was, plus one     */
/*  specific to this feature: the composer's disabled state and the    */
/*  Firestore rule that would reject the write have to agree. A member */
/*  who can type into Town Hall and watch every send fail has been     */
/*  told nothing useful. Both sides call `canPostToConversation`, so   */
/*  they are provably answering the same question.                     */
/* ------------------------------------------------------------------ */

export type MessageRefusal =
  | "no-org"
  | "wrong-org"
  | "not-a-participant"
  | "announcements-only"
  | "self"
  | "too-many"
  | "empty"
  | "owners-only"
  | "not-yours"
  | "not-editable"
  | "not-town-hall";

export type MessageDecision =
  | { allowed: true }
  | { allowed: false; reason: MessageRefusal; message: string };

const ALLOWED: MessageDecision = { allowed: true };

function refuse(reason: MessageRefusal, message: string): MessageDecision {
  return { allowed: false, reason, message };
}

/**
 * Role comparison, spelled the same way `firestore.rules` spells it.
 *
 * The stored value has been written both cased and uncased over the life
 * of the collection — `subscribeToMembersByOrg` normalizes for the same
 * reason. A rule that accepts 'owner' and a client that only accepts
 * 'OWNER' would disagree about who may post in Town Hall.
 */
function isOwnerRole(role: string | null | undefined): boolean {
  return typeof role === "string" && role.toUpperCase() === "OWNER";
}

/* ------------------------------------------------------------------ */
/*  Reading and posting                                                */
/* ------------------------------------------------------------------ */

export interface ConversationFacts {
  type: ConversationType;
  conversationOrgId: string;
  /** Empty for Town Hall — its membership is the org itself. */
  participantIds: string[];
  viewerUid: string;
  viewerOrgId: string;
  viewerRole: string | null;
}

/**
 * Whether this person may see the thread at all.
 *
 * The org check comes first and is never skipped: it is the same
 * boundary every other collection enforces, and for `townhall` it is the
 * ONLY check — which is the point of Town Hall, and why it carries no
 * participant list to fall out of sync.
 */
export function canReadConversation(facts: ConversationFacts): MessageDecision {
  if (!facts.viewerOrgId) {
    return refuse("no-org", "You do not belong to a workspace yet.");
  }
  if (facts.viewerOrgId !== facts.conversationOrgId) {
    return refuse("wrong-org", "That conversation is not in your workspace.");
  }
  if (facts.type === "townhall") return ALLOWED;

  if (!facts.participantIds.includes(facts.viewerUid)) {
    return refuse("not-a-participant", "You are not in this conversation.");
  }
  return ALLOWED;
}

/**
 * Whether this person may send into the thread.
 *
 * Town Hall is read-only for everyone but owners by design — it is
 * the notices channel, not a group chat. That is the one place where
 * posting is narrower than reading, and it is why this is a separate
 * function rather than a flag on the one above.
 */
export function canPostToConversation(facts: ConversationFacts): MessageDecision {
  const canRead = canReadConversation(facts);
  if (!canRead.allowed) return canRead;

  if (facts.type === "townhall" && !isOwnerRole(facts.viewerRole)) {
    return refuse("announcements-only", "Only owners can post in Town Hall.");
  }
  return ALLOWED;
}

/* ------------------------------------------------------------------ */
/*  Town Hall as the company's profile                                 */
/* ------------------------------------------------------------------ */

/**
 * Whether this person may speak for the company in Town Hall: rename
 * it, change its picture, pin notices, and post under its name.
 *
 * Every owner, not only the account holder — Town Hall is the
 * company's, and the owners run the company between them.
 */
export function canManageTownHall(facts: ConversationFacts): MessageDecision {
  const canRead = canReadConversation(facts);
  if (!canRead.allowed) return canRead;

  if (facts.type !== "townhall") {
    return refuse("not-town-hall", "Only Town Hall speaks for the company.");
  }
  if (!isOwnerRole(facts.viewerRole)) {
    return refuse("owners-only", "Only owners can change Town Hall.");
  }
  return ALLOWED;
}

/* ------------------------------------------------------------------ */
/*  Changing what was said                                             */
/* ------------------------------------------------------------------ */

export interface MessageFacts extends ConversationFacts {
  senderId: string;
  /** Whether the message carries a forwarded task card. */
  hasTaskRef: boolean;
  /** Whether it has words in it, as opposed to only a picture. */
  hasText: boolean;
}

/**
 * Whether this person may delete the message for everyone.
 *
 * Owners only, in any thread they can read. The message leaves the
 * thread entirely — no "withdrawn" placeholder — so nobody reading it
 * afterwards can tell anything was there. The one exception is the
 * account holder's history view, which is not decided here.
 */
export function canDeleteMessage(facts: MessageFacts): MessageDecision {
  const canRead = canReadConversation(facts);
  if (!canRead.allowed) return canRead;

  if (!isOwnerRole(facts.viewerRole)) {
    return refuse("owners-only", "Only owners can delete messages.");
  }
  return ALLOWED;
}

/**
 * Whether this person may rewrite the message.
 *
 * Your own words only, and only while you can still post in the thread
 * — a Member demoted out of Town Hall rights cannot reach back into it.
 * A task card is server-written and quotes a real directive, so it is
 * never editable, and a bare picture has no words to change.
 */
export function canEditMessage(facts: MessageFacts): MessageDecision {
  const canPost = canPostToConversation(facts);
  if (!canPost.allowed) return canPost;

  if (facts.senderId !== facts.viewerUid) {
    return refuse("not-yours", "You can only edit your own messages.");
  }
  if (facts.hasTaskRef || !facts.hasText) {
    return refuse("not-editable", "That message cannot be edited.");
  }
  return ALLOWED;
}

/* ------------------------------------------------------------------ */
/*  Opening a thread                                                   */
/* ------------------------------------------------------------------ */

export interface DmFacts {
  callerUid: string;
  callerOrgId: string;
  targetUid: string;
  targetOrgId: string;
}

/**
 * Whether one member may open a 1:1 with another.
 *
 * Same two conditions as `canStartDirectCall`, for the same reason: the
 * workspace is the boundary, and a thread with yourself is not a thing.
 */
export function canOpenDm(facts: DmFacts): MessageDecision {
  if (!facts.callerOrgId) {
    return refuse("no-org", "You do not belong to a workspace yet.");
  }
  if (facts.callerOrgId !== facts.targetOrgId) {
    return refuse("wrong-org", "You can only message people in your workspace.");
  }
  if (facts.callerUid === facts.targetUid) {
    return refuse("self", "You cannot message yourself.");
  }
  return ALLOWED;
}

export interface GroupFacts {
  creatorUid: string;
  creatorOrgId: string;
  /**
   * The proposed members with the org each one actually belongs to, read
   * on the server. A uid the client sent is a request; the orgId beside
   * it is the fact that decides.
   */
  participants: { uid: string; orgId: string }[];
  /** The bound from `lib/validations/messages`. */
  maxParticipants: number;
}

/**
 * Whether this person may create this group.
 *
 * No role check and no approval: any member may start a group, the same
 * way any member may ring any colleague. What is checked is that nobody
 * from outside the workspace is quietly added to it — a group is the one
 * path here that names other people, so it is the one that could pull an
 * outsider into a thread if it trusted the client's list.
 */
export function canCreateGroup(facts: GroupFacts): MessageDecision {
  if (!facts.creatorOrgId) {
    return refuse("no-org", "You do not belong to a workspace yet.");
  }

  const others = facts.participants.filter((p) => p.uid !== facts.creatorUid);
  if (others.length === 0) {
    return refuse("empty", "Choose at least one other person for the group.");
  }
  if (others.some((p) => p.orgId !== facts.creatorOrgId)) {
    return refuse("wrong-org", "You can only add people from your workspace.");
  }
  /* The creator counts toward the cap — they are in the room. */
  if (others.length + 1 > facts.maxParticipants) {
    return refuse("too-many", `A group can hold ${facts.maxParticipants} people.`);
  }
  return ALLOWED;
}
