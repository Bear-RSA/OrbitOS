import {
  collection,
  doc,
  getDocs,
  limit as limitTo,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Conversation, Message, MessageAttachment } from "@/types/message";
import { messagePreview, messageTextSchema } from "@/lib/validations/messages";
import { hasContent, isValidAttachment } from "@/lib/messages/attachment";

/* ------------------------------------------------------------------ */
/*  Message subscriptions and writes                                   */
/*                                                                     */
/*  Narrow client listeners, the same pattern as `queries/members` and */
/*  `queries/calls` — one open conversation, one bounded query. NOT    */
/*  the SSE path in `/api/telemetry/stream`: that exists because an    */
/*  org-wide activity aggregate got expensive enough to need a         */
/*  concurrency guard, and a conversation is the opposite shape. One   */
/*  thread, one listener, an explicit `limit` on every one of them.    */
/*                                                                     */
/*  The bound is not decoration. Chat volume over a year will dwarf    */
/*  the activity log that guard was built for, and an unbounded        */
/*  listener on a two-year-old thread re-downloads the entire history  */
/*  every time somebody opens it.                                      */
/* ------------------------------------------------------------------ */

const CONVERSATIONS_COLLECTION = "conversations";
const MESSAGES_SUBCOLLECTION = "messages";

/**
 * How many messages a thread holds open at once, and how many one
 * scroll-up fetches. Roughly two screens: enough that opening a thread
 * shows a conversation rather than a fragment.
 */
export const MESSAGE_PAGE_SIZE = 50;

/**
 * How many threads the left rail holds open.
 *
 * Bounded for the same reason the transcript is: somebody two years
 * into the product has hundreds of dead one-line threads, and the rail
 * only ever shows the top of the list.
 */
export const CONVERSATION_PAGE_SIZE = 50;

function messagesRef(conversationId: string) {
  return collection(db, CONVERSATIONS_COLLECTION, conversationId, MESSAGES_SUBCOLLECTION);
}

function toMessage(d: { id: string; data: () => any }): Message {
  return { id: d.id, ...d.data() } as Message;
}

/* ------------------------------------------------------------------ */
/*  Reading                                                            */
/* ------------------------------------------------------------------ */

/**
 * The threads this person is in, most recently active first.
 *
 * Covers dms and groups. Town Hall is deliberately NOT here: it has no
 * `participantIds`, because its membership is the org itself, so it is
 * watched by id through `subscribeToConversation` and pinned to the top
 * of the rail instead.
 *
 * `orgId` is pinned alongside the array filter, and that is not
 * decorative. The read rule requires `isInOrg(resource.data.orgId)`,
 * and Firestore only permits a listen when the rule is provable from
 * the query's own constraints — without it the whole subscription is
 * denied and the rail comes back empty, exactly as `queries/calls`
 * pins it for the same reason.
 *
 * A thread nobody has written in yet sorts last, since `lastMessageAt`
 * is null until the first send. It is still in the list, which is what
 * matters: opening a dm and finding it missing from the rail would be
 * worse than finding it at the bottom.
 */
export function subscribeToConversations(
  uid: string,
  orgId: string,
  callback: (conversations: Conversation[]) => void,
  pageSize: number = CONVERSATION_PAGE_SIZE
) {
  const q = query(
    collection(db, CONVERSATIONS_COLLECTION),
    where("orgId", "==", orgId),
    where("participantIds", "array-contains", uid),
    orderBy("lastMessageAt", "desc"),
    limitTo(pageSize)
  );

  return onSnapshot(
    q,
    (snapshot) =>
      callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Conversation)),
    (err) => {
      console.error("[Conversations Subscription Error]:", err);
      callback([]);
    }
  );
}

/**
 * One conversation, live.
 *
 * A direct document listener rather than a query, which is what lets
 * Town Hall sit in the left rail without being in anybody's
 * `participantIds`: its id is derivable, so the client can watch it by
 * name. It fires with `null` until the document is materialized.
 */
export function subscribeToConversation(
  conversationId: string,
  callback: (conversation: Conversation | null) => void
) {
  return onSnapshot(
    doc(db, CONVERSATIONS_COLLECTION, conversationId),
    (snap) =>
      callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as Conversation) : null),
    (err) => {
      console.error("[Conversation Subscription Error]:", err);
      callback(null);
    }
  );
}

/**
 * The newest messages in a thread, live, oldest-first.
 *
 * Firestore can only take the newest N by ordering DESCENDING, but a
 * transcript reads downward — so the page is fetched newest-first and
 * handed back reversed. The caller gets a thread in reading order and
 * never has to know which way the query ran.
 */
export function subscribeToMessages(
  conversationId: string,
  callback: (messages: Message[]) => void,
  pageSize: number = MESSAGE_PAGE_SIZE
) {
  const q = query(
    messagesRef(conversationId),
    orderBy("createdAt", "desc"),
    limitTo(pageSize)
  );

  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map(toMessage).reverse()),
    (err) => {
      console.error("[Messages Subscription Error]:", err);
      callback([]);
    }
  );
}

/**
 * One page of history older than what is already on screen.
 *
 * A one-shot read, not a listener: history does not change, and keeping
 * a listener open per page would turn scrolling back through a long
 * thread into a growing pile of subscriptions.
 */
export async function loadOlderMessages(
  conversationId: string,
  before: Timestamp,
  pageSize: number = MESSAGE_PAGE_SIZE
): Promise<Message[]> {
  const q = query(
    messagesRef(conversationId),
    orderBy("createdAt", "desc"),
    startAfter(before),
    limitTo(pageSize)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(toMessage).reverse();
}

/* ------------------------------------------------------------------ */
/*  Writing                                                            */
/* ------------------------------------------------------------------ */

/**
 * Sends one message.
 *
 * Two writes in one batch, because they are one fact: the message
 * itself, and the "what happened last" trio the left rail renders from.
 * Split apart, a failure between them leaves a thread whose preview
 * disagrees with its last message — and the rail is the only place most
 * of these threads are ever seen from.
 *
 * `createdAt` is a server timestamp because the rule pins it to
 * `request.time`. A client clock is not evidence of when something was
 * said, and here it would also decide the order of the transcript.
 *
 * No `senderName` is written — see the note in `types/message`. The
 * thread resolves it from the member list it already holds.
 */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  rawText: string,
  attachment: MessageAttachment | null = null
): Promise<void> {
  const text = rawText.trim();

  /* A picture may travel with no words, and words with no picture, but
     an empty row is not a message. */
  if (!hasContent(text, attachment)) {
    throw new Error("Write something first.");
  }
  if (text) messageTextSchema.parse(text);

  /* Refused here so the sender gets a message rather than a rejected
     write. The rules refuse it again — see the note in
     `lib/messages/attachment` about why the URL is not the client's to
     choose freely. */
  if (attachment && !isValidAttachment(attachment)) {
    throw new Error("That attachment is not allowed.");
  }

  const batch = writeBatch(db);
  const messageRef = doc(messagesRef(conversationId));

  batch.set(messageRef, {
    senderId,
    text,
    attachment,
    createdAt: serverTimestamp(),
    editedAt: null,
    deletedAt: null,
  });

  batch.update(doc(db, CONVERSATIONS_COLLECTION, conversationId), {
    lastMessageAt: serverTimestamp(),
    /* The rail cannot show a picture, so it says what arrived. Words win
       when there are any — a caption is more use than "Sent a GIF". */
    lastMessagePreview: text
      ? messagePreview(text)
      : attachment?.kind === "sticker"
        ? "Sent a sticker"
        : "Sent a GIF",
    lastMessageBy: senderId,
  });

  await batch.commit();
}

/**
 * Marks the thread read for one person.
 *
 * A dotted field path, so this touches one key of `lastReadAt` and
 * leaves everybody else's alone — which is exactly what the rule
 * enforces. Writing the whole map back would be rejected.
 */
export async function markConversationRead(
  conversationId: string,
  uid: string
): Promise<void> {
  await updateDoc(doc(db, CONVERSATIONS_COLLECTION, conversationId), {
    [`lastReadAt.${uid}`]: serverTimestamp(),
  });
}
