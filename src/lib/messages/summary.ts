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
