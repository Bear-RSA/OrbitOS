import { Timestamp } from "firebase/firestore";
import type { TaskStatus } from "@/types/task";

/* ------------------------------------------------------------------ */
/*  Messages Schema                                                    */
/*                                                                     */
/*  One collection carries three things that look different on screen  */
/*  and are the same record underneath: a 1:1 thread, a named group,   */
/*  and the org's announcements channel. What separates them is `type` */
/*  and who is allowed to write — not a different shape, and not a     */
/*  different collection.                                              */
/*                                                                     */
/*  Modelling them apart would mean three left-rail queries, three     */
/*  rule blocks, and three answers to "what was the last thing said    */
/*  here". One collection with a discriminant gives one of each.       */
/* ------------------------------------------------------------------ */

/**
 * `dm` and `group` carry a participant list. `townhall` deliberately
 * does not — see `participantIds` below.
 */
export type ConversationType = "dm" | "group" | "townhall";

/**
 * What the announcements channel is called.
 *
 * Stored on the document like any other conversation name, so the left
 * rail and the thread header read it the same way they read a group
 * name — but defined here because it is fixed, not chosen: there is one
 * per org and nobody renames it. Kept out of `actions/messages` because
 * a "use server" file may only export async functions.
 */
export const TOWN_HALL_NAME = "Town Hall";

export interface Conversation {
  id: string;
  orgId: string;
  type: ConversationType;

  /** null for a dm — the other person's name IS the title. */
  name: string | null;

  /**
   * Who is in this thread, for `dm` and `group` only.
   *
   * Town Hall leaves this empty, because its membership is "everyone
   * currently in the org" and that changes as people join and leave.
   * Keeping an array in sync would need a write on every invite
   * acceptance and every removal, and there is no Cloud Function here to
   * hook either. Town Hall access is derived instead, the same way
   * `tasks` and `events` derive it: `isInOrg` / `isOwner` against the
   * live `users/{uid}` doc.
   */
  participantIds: string[];

  /**
   * Names captured at creation, same contract as `guestNames` on an
   * engagement: the left rail renders a list of threads without joining
   * every one of them back to the directory.
   *
   * This is a cache for a title, never an authority. Who may read or
   * post is decided from `participantIds` and the live user doc.
   */
  participantNames: Record<string, string>;

  createdBy: string;
  createdAt: Timestamp;

  /**
   * The "what happened last" trio. Denormalized so the left rail never
   * opens a `messages` subcollection just to draw itself — thirty
   * threads would otherwise be thirty extra listeners.
   */
  lastMessageAt: Timestamp | null;
  lastMessagePreview: string | null;
  lastMessageBy: string | null;

  /**
   * When each participant last read this thread, keyed by uid. Drives
   * the unread dot, and is the only per-person state on the document —
   * which is why the rules let a member edit their own key and no one
   * else's.
   */
  lastReadAt: Record<string, Timestamp>;

  /**
   * When each person last cleared this thread from their own rail,
   * keyed by uid.
   *
   * Per-participant, and that is the whole design. A dm belongs to two
   * people: tidying your own list must not reach across and delete the
   * other person's copy of what was said. So clearing hides the thread
   * for you and touches nothing for them — the same bargain
   * `lastReadAt` makes, enforced by the same rule.
   *
   * It hides rather than deletes, and it is dated rather than a flag:
   * a new message is newer than the mark, so the thread comes back on
   * its own. You cleared what had been said, not the relationship.
   *
   * Absent on conversations created before this existed, which reads as
   * "never cleared" and needs no migration.
   */
  clearedAt?: Record<string, Timestamp>;
}

/**
 * A picture carried by a message — a GIF or a sticker.
 *
 * Stored by REFERENCE, not by value: the bytes stay on the providers
 * CDN and the message holds a URL. That is what keeps a 3MB reaction
 * out of Firestore, where every participants listener would pay to
 * download it.
 *
 * The dimensions travel with it so the thread can reserve the right box
 * before the image loads. Without them every incoming GIF reflows the
 * transcript out from under whoever is reading it.
 */
export interface MessageAttachment {
  kind: "gif" | "sticker";
  /** The animated file. */
  url: string;
  /** A smaller still or low-res loop, for the grid and for slow links. */
  previewUrl: string;
  width: number;
  height: number;
  /** What it shows, for anyone who cannot see it. */
  alt: string;
  provider: "giphy";
  /** The providers own id, so a duplicate send is recognisable. */
  providerId: string;
}

/**
 * A task carried into a conversation, so the thread can be about it.
 *
 * By REFERENCE and by SNAPSHOT at once, and the pair is the whole
 * design. `taskId` and `projectId` are the reference — the card opens
 * the live directive, which is where its real state lives. The rest is
 * a snapshot of how the task looked at the moment it was forwarded, so
 * a thread from March still reads as the conversation it was: "why is
 * this still IDLE" makes no sense against a card that has quietly
 * caught up with the task.
 *
 * Same contract as `participantNames` and `lastMessagePreview` — a
 * cache for a label, never an authority. The card says when it was
 * taken, and the link is how you find out what is true now.
 *
 * Written ONLY by `forwardTaskAction` on the Admin SDK. `firestore.rules`
 * does not list `taskRef` among the keys a client may write on a
 * message, so a browser cannot mint one — which is what lets the card
 * be drawn as a quotation of a real directive rather than as text
 * somebody typed.
 */
export interface MessageTaskRef {
  taskId: string;
  /** Where the card links back to. */
  projectId: string;

  /* ---- The snapshot. Taken on the server from the task document. ---- */

  title: string;
  status: TaskStatus;
  /** "YYYY-MM-DD", or null for a directive with no horizon. */
  dueDateKey: string | null;
  /** Names at forward time, so an unassigned task reads as unassigned. */
  assigneeNames: string[];
  isBlocked: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  createdAt: Timestamp;

  /**
   * The written part. May be empty when the message is only a picture —
   * but a message with neither text nor attachment is not a message,
   * and both the client and the rules refuse it.
   */
  text: string;

  /** null for an ordinary written message. */
  attachment: MessageAttachment | null;

  /**
   * The directive this message is about, when it was forwarded from a
   * project rather than typed. null on every ordinary message.
   *
   * A forwarded task may travel with no words — "look at this" is what
   * the card already says — so unlike an attachment it satisfies the
   * "a message must say something" test on its own.
   */
  taskRef?: MessageTaskRef | null;

  editedAt: Timestamp | null;

  /**
   * Soft delete, same reasoning as a cancelled engagement: the thread is
   * a record of a conversation, and a hole in it is worse than a line
   * saying something was withdrawn.
   */
  deletedAt: Timestamp | null;
}

/**
 * A conversation as the left rail needs it: the thread plus the two
 * things only the viewer can answer.
 */
export interface ConversationSummary extends Conversation {
  /** Resolved per viewer — the other person for a dm, `name` otherwise. */
  title: string;
  unread: boolean;
}
