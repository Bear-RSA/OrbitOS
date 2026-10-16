"use server";

import { FieldValue, Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireCaller, type Caller } from "@/lib/auth/caller";
import { canDeleteMessage, canEditMessage, canReadConversation } from "@/lib/messages/access";
import { railPreview } from "@/lib/messages/rail-preview";
import { isInternalManagement } from "@/lib/internal-management/store";
import {
  conversationIdSchema,
  editMessageSchema,
  messageRefSchema,
} from "@/lib/validations/messages";
import type { MessageHistoryEntry } from "@/types/message";

/* ------------------------------------------------------------------ */
/*  Editing and deleting messages                                      */
/*                                                                     */
/*  Both leave the thread looking as if nothing happened. An edit      */
/*  carries no "edited" mark and a delete removes the document, so a   */
/*  reader sees only what is there now.                                */
/*                                                                     */
/*  The record of the change goes to `conversations/{id}/history`,     */
/*  which `firestore.rules` closes to every client. Internal           */
/*  Management reads it through `getMessageHistoryAction`, and nobody  */
/*  else can. That is why these are server actions rather than client  */
/*  writes: the change and its record have to land together, and a     */
/*  browser must not be able to make one without the other.            */
/* ------------------------------------------------------------------ */

const CONVERSATIONS = "conversations";
const MESSAGES = "messages";
const HISTORY = "history";

/** How much history Internal Management's view loads for one thread. */
const HISTORY_LIMIT = 300;

type Result = { success: true } | { success: false; error: string };

type OkCaller = Extract<Caller, { ok: true }>;

function factsFor(
  caller: OkCaller,
  conversation: FirebaseFirestore.DocumentData,
  message: FirebaseFirestore.DocumentData
) {
  return {
    type: conversation.type,
    conversationOrgId: (conversation.orgId as string) ?? "",
    participantIds: (conversation.participantIds as string[]) ?? [],
    viewerUid: caller.uid,
    viewerOrgId: caller.orgId,
    viewerRole: caller.role,
    senderId: (message.senderId as string) ?? "",
    hasTaskRef: Boolean(message.taskRef),
    hasText: typeof message.text === "string" && message.text.trim().length > 0,
  };
}

/**
 * Brings the rail's "what happened last" trio back in line with the
 * newest message still in the thread.
 *
 * Run after every edit and delete. Without it the preview would go on
 * quoting a deleted line, which is exactly the trace a delete is meant
 * not to leave.
 */
async function refreshRail(conversationRef: FirebaseFirestore.DocumentReference) {
  const latest = await conversationRef
    .collection(MESSAGES)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  const last = latest.docs[0]?.data();
  await conversationRef.update(
    last
      ? {
          lastMessageAt: last.createdAt ?? null,
          lastMessagePreview: railPreview(last),
          lastMessageBy: last.senderId ?? null,
          lastMessageAsCompany: last.asCompany === true,
        }
      : {
          lastMessageAt: null,
          lastMessagePreview: null,
          lastMessageBy: null,
          lastMessageAsCompany: false,
        }
  );
}

/* ------------------------------------------------------------------ */
/*  Edit                                                               */
/* ------------------------------------------------------------------ */

/** Rewrites the caller's own message. Nobody but Internal Management sees it changed. */
export async function editMessageAction(input: unknown): Promise<Result> {
  try {
    const parsed = editMessageSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid edit." };
    }
    const { conversationId, messageId, text } = parsed.data;

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const conversationRef = adminDb.collection(CONVERSATIONS).doc(conversationId);
    const messageRef = conversationRef.collection(MESSAGES).doc(messageId);

    const refused = await adminDb.runTransaction(async (tx) => {
      const [conversationSnap, messageSnap] = await Promise.all([
        tx.get(conversationRef),
        tx.get(messageRef),
      ]);
      if (!conversationSnap.exists || !messageSnap.exists) {
        return "That message no longer exists.";
      }
      const message = messageSnap.data()!;

      const decision = canEditMessage(factsFor(caller, conversationSnap.data()!, message));
      if (!decision.allowed) return decision.message;

      if (message.text === text) return null;

      tx.create(conversationRef.collection(HISTORY).doc(), {
        messageId,
        kind: "edited",
        actorId: caller.uid,
        at: AdminTimestamp.now(),
        senderId: message.senderId,
        sentAt: message.createdAt ?? null,
        text: message.text ?? "",
        attachment: message.attachment ?? null,
        taskRef: message.taskRef ?? null,
        asCompany: message.asCompany === true,
      });
      tx.update(messageRef, { text });
      return null;
    });

    if (refused) return { success: false, error: refused };
    await refreshRail(conversationRef);
    return { success: true };
  } catch (err) {
    console.error("[MessageHistory] Failed to edit message:", err);
    return { success: false, error: "Could not save that edit." };
  }
}

/* ------------------------------------------------------------------ */
/*  Delete                                                             */
/* ------------------------------------------------------------------ */

/** Removes a message for everyone. Owners only. */
export async function deleteMessageAction(input: unknown): Promise<Result> {
  try {
    const parsed = messageRefSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid message." };
    const { conversationId, messageId } = parsed.data;

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const conversationRef = adminDb.collection(CONVERSATIONS).doc(conversationId);
    const messageRef = conversationRef.collection(MESSAGES).doc(messageId);

    const refused = await adminDb.runTransaction(async (tx) => {
      const [conversationSnap, messageSnap] = await Promise.all([
        tx.get(conversationRef),
        tx.get(messageRef),
      ]);
      if (!conversationSnap.exists) return "That conversation no longer exists.";
      /* Already gone — two owners deleting at once both get what they wanted. */
      if (!messageSnap.exists) return null;
      const message = messageSnap.data()!;

      const decision = canDeleteMessage(factsFor(caller, conversationSnap.data()!, message));
      if (!decision.allowed) return decision.message;

      tx.create(conversationRef.collection(HISTORY).doc(), {
        messageId,
        kind: "deleted",
        actorId: caller.uid,
        at: AdminTimestamp.now(),
        senderId: message.senderId,
        sentAt: message.createdAt ?? null,
        text: message.text ?? "",
        attachment: message.attachment ?? null,
        taskRef: message.taskRef ?? null,
        asCompany: message.asCompany === true,
      });
      tx.delete(messageRef);
      /* A pin pointing at nothing would leave an empty slot in the strip
         — a trace, and a slot nobody could fill until it was found. */
      if (((conversationSnap.data()!.pinnedMessageIds as string[]) ?? []).includes(messageId)) {
        tx.update(conversationRef, { pinnedMessageIds: FieldValue.arrayRemove(messageId) });
      }
      return null;
    });

    if (refused) return { success: false, error: refused };
    await refreshRail(conversationRef);
    return { success: true };
  } catch (err) {
    console.error("[MessageHistory] Failed to delete message:", err);
    return { success: false, error: "Could not delete that message." };
  }
}

/* ------------------------------------------------------------------ */
/*  Internal Management's view                                         */
/* ------------------------------------------------------------------ */

/** Whether the caller is in Internal Management, and so may open message history. */
export async function canViewMessageHistoryAction(): Promise<boolean> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return false;
    return await isInternalManagement(caller.orgId, caller.uid);
  } catch (err) {
    console.error("[MessageHistory] Could not check access:", err);
    return false;
  }
}

/**
 * Every edit and delete in one thread, newest first.
 *
 * Internal Management only, and only in threads they can read: being in
 * it does not open a dm between two colleagues.
 */
export async function getMessageHistoryAction(
  conversationId: unknown
): Promise<{ success: true; entries: MessageHistoryEntry[] } | { success: false; error: string }> {
  try {
    const parsedId = conversationIdSchema.safeParse(conversationId);
    if (!parsedId.success) return { success: false, error: "Invalid conversation." };

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const conversationRef = adminDb.collection(CONVERSATIONS).doc(parsedId.data);
    const [allowed, conversationSnap] = await Promise.all([
      isInternalManagement(caller.orgId, caller.uid),
      conversationRef.get(),
    ]);

    if (!allowed) {
      return { success: false, error: "Only Internal Management can see message history." };
    }
    if (!conversationSnap.exists) return { success: false, error: "That conversation no longer exists." };

    const conversation = conversationSnap.data()!;
    const decision = canReadConversation({
      type: conversation.type,
      conversationOrgId: (conversation.orgId as string) ?? "",
      participantIds: (conversation.participantIds as string[]) ?? [],
      viewerUid: caller.uid,
      viewerOrgId: caller.orgId,
      viewerRole: caller.role,
    });
    if (!decision.allowed) return { success: false, error: decision.message };

    const snap = await conversationRef
      .collection(HISTORY)
      .orderBy("at", "desc")
      .limit(HISTORY_LIMIT)
      .get();

    const entries: MessageHistoryEntry[] = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        messageId: data.messageId,
        kind: data.kind === "edited" ? "edited" : "deleted",
        actorId: data.actorId,
        atMs: data.at?.toMillis?.() ?? 0,
        senderId: data.senderId,
        sentAtMs: data.sentAt?.toMillis?.() ?? 0,
        text: typeof data.text === "string" ? data.text : "",
        attachment: data.attachment ?? null,
        taskRef: data.taskRef ?? null,
        asCompany: data.asCompany === true,
      };
    });

    return { success: true, entries };
  } catch (err) {
    console.error("[MessageHistory] Failed to load history:", err);
    return { success: false, error: "Could not load message history." };
  }
}
