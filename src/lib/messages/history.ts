import { Timestamp } from "firebase/firestore";
import type { Message, MessageHistoryEntry } from "@/types/message";

/* ------------------------------------------------------------------ */
/*  Message history                                                    */
/*                                                                     */
/*  Edits and deletes leave nothing behind in the thread itself. The   */
/*  account holder is the one person who can see what changed, and     */
/*  this folds that history back into a transcript for them.           */
/* ------------------------------------------------------------------ */

export interface FoldedHistory {
  /** The live messages plus a ghost for every deleted one, in time order. */
  messages: Message[];
  /** Ghost id to the delete that removed it. */
  removed: Map<string, MessageHistoryEntry>;
  /** Message id to its earlier wordings, oldest first. */
  edits: Map<string, MessageHistoryEntry[]>;
}

/** Ghost ids cannot collide with a Firestore auto id, which has no dash. */
export function ghostId(entry: MessageHistoryEntry): string {
  return `deleted-${entry.id}`;
}

/**
 * Lays the history over what is on screen.
 *
 * Only deletes inside the window already loaded are put back, so the
 * transcript does not suddenly grow a week of ghosts above the first
 * page. `oldestMs` is the earliest message on screen; 0 means the whole
 * thread is loaded, or empty, and every delete belongs.
 */
export function foldHistory(
  messages: Message[],
  entries: MessageHistoryEntry[],
  oldestMs: number
): FoldedHistory {
  const removed = new Map<string, MessageHistoryEntry>();
  const edits = new Map<string, MessageHistoryEntry[]>();
  const ghosts: Message[] = [];

  for (const entry of entries) {
    if (entry.kind === "edited") {
      const list = edits.get(entry.messageId) ?? [];
      list.push(entry);
      edits.set(entry.messageId, list);
      continue;
    }
    if (oldestMs && entry.sentAtMs < oldestMs) continue;

    const id = ghostId(entry);
    removed.set(id, entry);
    ghosts.push({
      id,
      senderId: entry.senderId,
      createdAt: Timestamp.fromMillis(entry.sentAtMs),
      text: entry.text,
      attachment: entry.attachment,
      taskRef: entry.taskRef,
      asCompany: entry.asCompany,
      editedAt: null,
      deletedAt: null,
    });
  }

  for (const list of edits.values()) list.sort((a, b) => a.atMs - b.atMs);

  /* A deleted message keeps the edits it had, under its ghost's id. */
  for (const [id, entry] of removed) {
    const earlier = edits.get(entry.messageId);
    if (earlier) edits.set(id, earlier);
  }

  const merged = ghosts.length
    ? [...messages, ...ghosts].sort(
        (a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)
      )
    : messages;

  return { messages: merged, removed, edits };
}
