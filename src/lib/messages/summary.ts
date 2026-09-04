import type { Conversation } from "@/types/message";

/* ------------------------------------------------------------------ */
/*  Conversation summaries                                             */
/*                                                                     */
/*  What a thread is called, and whether it is waiting on you. Both    */
/*  are viewer-relative — a dm has no name of its own, and "unread" is */
/*  a different answer for each person in the room — so neither can be */
/*  stored on the document, and both are needed in two places at once  */
/*  (the left rail and the thread header).                             */
/*                                                                     */
/*  Pure, for the same reason `lib/messages/access` is: the rail and   */
/*  the header must not be able to disagree about which thread the     */
/*  reader is looking at.                                              */
/* ------------------------------------------------------------------ */

const UNKNOWN = "Unknown operative";

/** What `conversationTitle` needs, and nothing else. */
export type TitleFacts = Pick<
  Conversation,
  "type" | "name" | "participantIds" | "participantNames"
>;

/**
 * The name this reader sees on the thread.
 *
 * A group and Town Hall carry their own name. A dm does not: it is
 * called after the person on the other end, which is a different string
 * depending on who is asking.
 *
 * The live directory wins over `participantNames` when it has an answer.
 * The denormalized copy exists so the rail can draw thirty threads
 * without joining every one of them back to the member list — it is a
 * cache for a label, and a name someone changed last week should not
 * keep showing the old one.
 */
export function conversationTitle(
  conversation: TitleFacts,
  viewerUid: string,
  liveNames: Record<string, string> = {}
): string {
  if (conversation.type !== "dm") {
    return conversation.name?.trim() || "Untitled conversation";
  }

  const other = (conversation.participantIds ?? []).find((id) => id !== viewerUid);
  if (!other) return UNKNOWN;

  return liveNames[other] || conversation.participantNames?.[other] || UNKNOWN;
}

/* ------------------------------------------------------------------ */
/*  Unread                                                             */
/* ------------------------------------------------------------------ */

export interface UnreadFacts {
  lastMessageAtMs: number | null;
  lastReadAtMs: number | null;
  lastMessageBy: string | null;
  viewerUid: string;
}

/**
 * Whether this thread is waiting on this reader.
 *
 * Your own message never marks your own thread unread — the receipt is
 * written by the thread component a beat after the send lands, and
 * without this exception every message you post would light up your own
 * rail for that beat.
 */
export function isUnread(facts: UnreadFacts): boolean {
  if (!facts.lastMessageAtMs) return false;
  if (facts.lastMessageBy === facts.viewerUid) return false;
  return (facts.lastReadAtMs ?? 0) < facts.lastMessageAtMs;
}

/* ------------------------------------------------------------------ */
/*  Cleared                                                            */
/* ------------------------------------------------------------------ */

export interface ClearedFacts {
  clearedAtMs: number | null;
  lastMessageAtMs: number | null;
}

/**
 * Whether this thread should be out of this person's rail.
 *
 * Hidden only while nothing has happened since they cleared it. A
 * message that arrives afterwards is newer than the mark, so the thread
 * returns on its own — clearing is "I am done with this for now", not
 * "never speak to me again", and a colleague's reply disappearing into
 * a list nobody looks at is how a message goes unanswered for a week.
 */
export function isCleared(facts: ClearedFacts): boolean {
  if (!facts.clearedAtMs) return false;
  return (facts.lastMessageAtMs ?? 0) <= facts.clearedAtMs;
}

/** `isCleared` against a live conversation document. */
export function conversationCleared(
  conversation: Pick<Conversation, "lastMessageAt" | "clearedAt">,
  viewerUid: string
): boolean {
  return isCleared({
    clearedAtMs: conversation.clearedAt?.[viewerUid]?.toMillis?.() ?? null,
    lastMessageAtMs: conversation.lastMessageAt?.toMillis?.() ?? null,
  });
}

/**
 * The moment before which this person should see no messages.
 *
 * Clearing empties the transcript for the person who cleared it, not
 * for the room — so the thread still opens, and still shows anything
 * said since.
 */
export function clearedBeforeMs(
  conversation: Pick<Conversation, "clearedAt"> | null,
  viewerUid: string
): number {
  return conversation?.clearedAt?.[viewerUid]?.toMillis?.() ?? 0;
}

/** `isUnread` against a live conversation document. */
export function conversationUnread(
  conversation: Pick<Conversation, "lastMessageAt" | "lastMessageBy" | "lastReadAt">,
  viewerUid: string
): boolean {
  return isUnread({
    lastMessageAtMs: conversation.lastMessageAt?.toMillis?.() ?? null,
    lastReadAtMs: conversation.lastReadAt?.[viewerUid]?.toMillis?.() ?? null,
    lastMessageBy: conversation.lastMessageBy ?? null,
    viewerUid,
  });
}
