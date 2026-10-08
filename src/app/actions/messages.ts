"use server";

import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { cloudinary } from "@/lib/cloudinary";
import { requireServerUid } from "@/lib/auth/session";
import { resolveChatImageLimit } from "@/lib/auth/permissions";
import { dmConversationId, townHallConversationId } from "@/lib/messages/conversation-id";
import { canCreateGroup, canOpenDm, canPostToConversation } from "@/lib/messages/access";
import { attachmentPreview } from "@/lib/messages/attachment";
import {
  PREVIEW_WIDTH_PX,
  admitChatImage,
  applyChatImageDelta,
  chatImageAllowance,
  isChatImagePublicId,
  readChatImageUsage,
} from "@/lib/messages/image-ceiling";
import { taskForwardPreview, taskRefFromTask } from "@/lib/messages/task-ref";
import { dueDateKeyOf } from "@/lib/utils/dates";
import {
  MAX_GROUP_PARTICIPANTS,
  createGroupSchema,
  forwardTaskSchema,
  messagePreview,
  openDmSchema,
  sendImageMessageSchema,
} from "@/lib/validations/messages";
import { TOWN_HALL_NAME, type ImageAttachment } from "@/types/message";

/* ------------------------------------------------------------------ */
/*  Message Server Actions                                             */
/*                                                                     */
/*  Conversations are created here and nowhere else. A conversation    */
/*  names the people in it, and `participantIds` is what every rule    */
/*  and every listener checks — a client able to write that array      */
/*  could add itself to a thread it was never part of, or open one in  */
/*  somebody else's name. So `allow create: if false` in the rules,    */
/*  and the Admin SDK on this side.                                    */
/*                                                                     */
/*  Sending is deliberately NOT here. A message is ordinary org-scoped */
/*  data like a task, gated by `firestore.rules` and written straight  */
/*  from the client in `lib/queries/messages` — round-tripping every   */
/*  send through a server action would buy nothing and cost latency on */
/*  the one interaction in the product that has to feel instant.       */
/*                                                                     */
/*  Same as `actions/calls`: no `uid` argument. The caller comes from  */
/*  the verified session cookie, because a uid from the browser is an  */
/*  unverified claim and here it would buy a thread with somebody      */
/*  else's colleague, written under their name.                        */
/* ------------------------------------------------------------------ */

const CONVERSATIONS = "conversations";
const MESSAGES = "messages";

export type ConversationResult =
  | { success: true; conversationId: string }
  | { success: false; error: string };

/** Same shape as the guard in `actions/calls`, with an explicit discriminant. */
type Caller =
  | { ok: true; uid: string; orgId: string; name: string; role: string }
  | { ok: false; error: string };

async function requireCaller(): Promise<Caller> {
  let uid: string;
  try {
    uid = await requireServerUid();
  } catch {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }

  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) return { ok: false, error: "User not found." };

  const data = snap.data()!;
  if (!data.orgId) return { ok: false, error: "Unauthorized." };

  return {
    ok: true,
    uid,
    orgId: data.orgId as string,
    name: (data.name as string) || "Operative",
    role: (data.role as string) || "MEMBER",
  };
}

/* ------------------------------------------------------------------ */
/*  Town Hall                                                          */
/* ------------------------------------------------------------------ */

/**
 * The workspace's announcements channel, materialized on first touch.
 *
 * Lazy rather than created with the org, because there is no Cloud
 * Function here to hook workspace creation and back-filling every
 * existing org would be a migration to maintain forever. The first
 * person to open Messages writes the document; everyone after that
 * finds it.
 *
 * Any member may materialize it. Being able to bring the notice board
 * into existence is not the same as being able to write on it — that is
 * the OWNER check, and it lives in the rules and in
 * `canPostToConversation`, not here.
 */
export async function getOrCreateTownHallAction(): Promise<ConversationResult> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const conversationId = townHallConversationId(caller.orgId);
    const ref = adminDb.collection(CONVERSATIONS).doc(conversationId);

    const snap = await ref.get();
    if (snap.exists) return { success: true, conversationId };

    try {
      await ref.create({
        orgId: caller.orgId,
        type: "townhall",
        name: TOWN_HALL_NAME,
        /* Empty on purpose. Town Hall's membership is the org itself,
           derived from the live user doc — see `types/message`. */
        participantIds: [],
        participantNames: {},
        /* Whoever opened Messages first. It records who materialized the
           channel, not who owns it: posting rights come from the role. */
        createdBy: caller.uid,
        createdAt: AdminTimestamp.now(),
        lastMessageAt: null,
        lastMessagePreview: null,
        lastMessageBy: null,
        lastReadAt: {},
      });
    } catch (err: any) {
      /* Two people opening Messages at the same moment both find no
         document and both try to write one. `create` refuses the second,
         which is the outcome we want — the id is deterministic, so the
         loser is already looking at the winner's document. */
      if (err?.code !== 6 && err?.code !== "already-exists") throw err;
    }

    return { success: true, conversationId };
  } catch (err: any) {
    console.error("[MessageAction] Failed to open Town Hall:", err);
    return { success: false, error: "Could not open Town Hall." };
  }
}

/* ------------------------------------------------------------------ */
/*  Direct messages                                                    */
/* ------------------------------------------------------------------ */

/**
 * The thread between the caller and one colleague, materialized on
 * first touch.
 *
 * Get-or-create, not create — the same bargain `lib/calls/room-id`
 * makes with rooms, arrived at from the other direction. The id is
 * derived from the sorted pair, so clicking a name is idempotent: the
 * second click finds the thread the first one wrote, and two people
 * opening each other simultaneously land on one document instead of
 * two half-conversations.
 *
 * The target's org is read here rather than trusted from the client.
 * The uid the browser sent is a request; the orgId beside it in the
 * user doc is the fact that decides, and it is the same boundary
 * `startCallAction` enforces before one member may ring another.
 */
export async function getOrCreateDmAction(input: unknown): Promise<ConversationResult> {
  try {
    const parsed = openDmSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid conversation.",
      };
    }
    const { targetUid } = parsed.data;

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const targetSnap = await adminDb.collection("users").doc(targetUid).get();
    if (!targetSnap.exists) {
      return { success: false, error: "That person wasn't found." };
    }
    const target = targetSnap.data()!;

    const decision = canOpenDm({
      callerUid: caller.uid,
      callerOrgId: caller.orgId,
      targetUid,
      targetOrgId: (target.orgId as string) ?? "",
    });
    if (!decision.allowed) return { success: false, error: decision.message };

    const conversationId = dmConversationId(caller.orgId, caller.uid, targetUid);
    const ref = adminDb.collection(CONVERSATIONS).doc(conversationId);

    const snap = await ref.get();
    if (snap.exists) return { success: true, conversationId };

    const targetName = (target.name as string) || "Operative";

    try {
      await ref.create({
        orgId: caller.orgId,
        type: "dm",
        /* A dm has no name of its own — it is called after whoever is
           on the other end, which is a different answer for each of the
           two people in it. See `conversationTitle`. */
        name: null,
        /* Sorted, so the array matches the id it was derived from. */
        participantIds: [caller.uid, targetUid].sort(),
        participantNames: {
          [caller.uid]: caller.name,
          [targetUid]: targetName,
        },
        createdBy: caller.uid,
        createdAt: AdminTimestamp.now(),
        /* Null rather than absent: `orderBy` skips documents missing the
           field entirely, and a thread nobody has written in yet still
           has to appear in the rail of the person who just opened it. */
        lastMessageAt: null,
        lastMessagePreview: null,
        lastMessageBy: null,
        lastReadAt: {},
      });
    } catch (err: any) {
      // Both ends clicking at once — see the note in Town Hall above.
      if (err?.code !== 6 && err?.code !== "already-exists") throw err;
    }

    return { success: true, conversationId };
  } catch (err: any) {
    console.error("[MessageAction] Failed to open direct message:", err);
    return { success: false, error: "Could not open that conversation." };
  }
}

/* ------------------------------------------------------------------ */
/*  Groups                                                             */
/* ------------------------------------------------------------------ */

/**
 * Creates a named group and puts the chosen people in it.
 *
 * A random id, unlike the other two: Town Hall and a dm are each the
 * only one of their kind, so deriving their ids is what makes them
 * findable. Two groups holding the same people are both legitimate —
 * "Launch crew" and "Launch crew, but honest" are different rooms — so
 * a derived id here would collapse threads that are meant to be apart.
 *
 * No role check and no approval: any member may start one, the same way
 * any member may ring any colleague. What IS checked is every uid in
 * the list, against the org on its own user doc. This is the only path
 * in the feature that names other people, so it is the only one that
 * could pull an outsider into a thread if it took the client's word.
 */
export async function createGroupAction(input: unknown): Promise<ConversationResult> {
  try {
    const parsed = createGroupSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid group." };
    }
    const { name, participantUids } = parsed.data;

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    /* De-duped, and the caller stripped out before the lookup — they are
       added below from the session, so a client listing itself twice
       cannot inflate the group or double its name in the map. */
    const targetUids = Array.from(new Set(participantUids)).filter(
      (id) => id !== caller.uid
    );
    if (targetUids.length === 0) {
      return { success: false, error: "Choose at least one other person for the group." };
    }

    const snaps = await adminDb.getAll(
      ...targetUids.map((id) => adminDb.collection("users").doc(id))
    );
    if (snaps.some((snap) => !snap.exists)) {
      return { success: false, error: "One of those people wasn't found." };
    }

    const targets = snaps.map((snap) => ({
      uid: snap.id,
      orgId: (snap.data()?.orgId as string) ?? "",
      name: (snap.data()?.name as string) || "Operative",
    }));

    const decision = canCreateGroup({
      creatorUid: caller.uid,
      creatorOrgId: caller.orgId,
      participants: targets.map(({ uid, orgId }) => ({ uid, orgId })),
      maxParticipants: MAX_GROUP_PARTICIPANTS,
    });
    if (!decision.allowed) return { success: false, error: decision.message };

    const ref = adminDb.collection(CONVERSATIONS).doc();

    await ref.set({
      orgId: caller.orgId,
      type: "group",
      name,
      participantIds: [caller.uid, ...targets.map((t) => t.uid)].sort(),
      participantNames: {
        [caller.uid]: caller.name,
        ...Object.fromEntries(targets.map((t) => [t.uid, t.name])),
      },
      createdBy: caller.uid,
      createdAt: AdminTimestamp.now(),
      lastMessageAt: null,
      lastMessagePreview: null,
      lastMessageBy: null,
      lastReadAt: {},
    });

    return { success: true, conversationId: ref.id };
  } catch (err: any) {
    console.error("[MessageAction] Failed to create group:", err);
    return { success: false, error: "Could not create that group." };
  }
}

/* ------------------------------------------------------------------ */
/*  Forwarding a task                                                  */
/* ------------------------------------------------------------------ */

/**
 * Puts a directive into a conversation so the thread can be about it.
 *
 * The one message path that does NOT go through the client, and the
 * reason is the card rather than the latency. `sendMessage` writes from
 * the browser because a message is text somebody typed and the rules
 * can pin everything that matters about it — author, time, length. A
 * task card is different: it is drawn as a quotation of a real
 * directive, with its title, its status and its horizon, and a browser
 * able to mint one could put a convincing card for a task that says
 * whatever it likes into a colleague's thread. So `taskRef` is absent
 * from the key allowlist in `firestore.rules`, no client write carrying
 * one is accepted, and the snapshot is taken here from the document.
 *
 * The extra round trip costs nothing that matters — forwarding is a
 * dialog with a Send button, not a keystroke.
 *
 * Open to every member, deliberately. Anyone who can see a directive
 * can hand it to someone and ask about it; what is checked is the
 * boundary that was already there — the task is in the caller's
 * workspace, and the caller may post in the thread. Town Hall stays
 * owner-only for the same reason it always was: it is the notice
 * board, and `canPostToConversation` is the single place that says so.
 */
export async function forwardTaskAction(input: unknown): Promise<ConversationResult> {
  try {
    const parsed = forwardTaskSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid forward.",
      };
    }
    const { taskId, conversationId, note } = parsed.data;

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const conversationRef = adminDb.collection(CONVERSATIONS).doc(conversationId);
    const [taskSnap, conversationSnap] = await Promise.all([
      adminDb.collection("tasks").doc(taskId).get(),
      conversationRef.get(),
    ]);

    if (!taskSnap.exists) return { success: false, error: "That task no longer exists." };
    const task = taskSnap.data()!;

    /* The workspace boundary, read off the task rather than taken from
       the client. Without it a member could forward a directive out of
       an org they merely knew the id of. */
    if ((task.orgId as string) !== caller.orgId) {
      return { success: false, error: "That task is not in your workspace." };
    }

    if (!conversationSnap.exists) {
      return { success: false, error: "That conversation no longer exists." };
    }
    const conversation = conversationSnap.data()!;

    /* The same decision the composer's disabled state asks, so a thread
       you cannot type in is not a thread you can forward into either. */
    const decision = canPostToConversation({
      type: conversation.type,
      conversationOrgId: (conversation.orgId as string) ?? "",
      participantIds: (conversation.participantIds as string[]) ?? [],
      viewerUid: caller.uid,
      viewerOrgId: caller.orgId,
      viewerRole: caller.role,
    });
    if (!decision.allowed) return { success: false, error: decision.message };

    const assigneeUids = Array.isArray(task.assignedTo) ? (task.assignedTo as string[]) : [];
    const assigneeSnaps = assigneeUids.length
      ? await adminDb.getAll(
          ...assigneeUids.map((id) => adminDb.collection("users").doc(id))
        )
      : [];
    const assigneeNames = assigneeSnaps
      .filter((snap) => snap.exists)
      .map((snap) => (snap.data()?.name as string) || "Operative");

    const taskRef = taskRefFromTask({
      taskId: taskSnap.id,
      projectId: (task.projectId as string) ?? "",
      title: (task.title as string) ?? "",
      status: task.status,
      /* Not `task.dueDateKey` directly: rows written before that field
         existed carry the day only in `dueDate`, and a card that says
         "no horizon" about a directive that has one is worse than one
         that says nothing. */
      dueDateKey: dueDateKeyOf({
        dueDateKey: task.dueDateKey as string | null | undefined,
        dueDate: (task.dueDate as { toDate: () => Date } | null) ?? null,
      }),
      isBlocked: task.isBlocked === true,
      assigneeNames,
    });

    if (!taskRef.projectId) {
      return { success: false, error: "That task is not attached to a project." };
    }

    /* One batch, for the reason `sendMessage` gives: the message and the
       rail's account of it are one fact, and a failure between them
       leaves a thread whose preview disagrees with its last line. */
    const batch = adminDb.batch();
    const messageRef = conversationRef.collection(MESSAGES).doc();

    batch.set(messageRef, {
      senderId: caller.uid,
      /* A forwarded task may travel with no words — the card is what is
         being said. Stored as "" rather than omitted so every message
         in the collection has the same shape. */
      text: note,
      attachment: null,
      taskRef,
      createdAt: AdminTimestamp.now(),
      editedAt: null,
      deletedAt: null,
    });

    batch.update(conversationRef, {
      lastMessageAt: AdminTimestamp.now(),
      lastMessagePreview: taskForwardPreview(taskRef.title, note),
      lastMessageBy: caller.uid,
    });

    await batch.commit();

    return { success: true, conversationId };
  } catch (err: any) {
    console.error("[MessageAction] Failed to forward task:", err);
    return { success: false, error: "Could not forward that task." };
  }
}

/* ------------------------------------------------------------------ */
/*  Sending a picture                                                  */
/* ------------------------------------------------------------------ */

/**
 * Records a picture the browser has already uploaded as a message.
 *
 * Server-written for the same reason a task card is, arrived at from
 * the URL rather than the content. A client-written attachment is
 * pinned by `firestore.rules` to GIPHY's CDN, because an arbitrary
 * `<img src>` in a colleague's browser is a tracking pixel. Our own
 * Cloudinary account cannot be named in the rules — the cloud name is
 * deployment config — so the URL is built here, from a `public_id` the
 * signing route chose, and the browser never gets to write one.
 *
 * The `public_id` the client sends is an echo of the one it was given,
 * checked against the folder this server would have signed for this
 * conversation in the caller's org. An id outside that prefix was never
 * signed, so Cloudinary refused the upload and there is nothing to
 * point at; an id inside it that was never uploaded gives the sender a
 * broken picture in their own thread and nothing more.
 *
 * Admission runs inside the transaction that records the message, so
 * the monthly counter and the message are one fact: two pastes that
 * race for the last slot cannot both take it.
 */
export async function sendImageMessageAction(input: unknown): Promise<ConversationResult> {
  try {
    const parsed = sendImageMessageSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid picture.",
      };
    }
    const { conversationId, publicId, width, height, bytes, text } = parsed.data;

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    if (!isChatImagePublicId(publicId, caller.orgId, conversationId)) {
      return { success: false, error: "That picture was not uploaded for this conversation." };
    }

    const conversationRef = adminDb.collection(CONVERSATIONS).doc(conversationId);
    const conversationSnap = await conversationRef.get();
    if (!conversationSnap.exists) {
      return { success: false, error: "That conversation no longer exists." };
    }
    const conversation = conversationSnap.data()!;

    const decision = canPostToConversation({
      type: conversation.type,
      conversationOrgId: (conversation.orgId as string) ?? "",
      participantIds: (conversation.participantIds as string[]) ?? [],
      viewerUid: caller.uid,
      viewerOrgId: caller.orgId,
      viewerRole: caller.role,
    });
    if (!decision.allowed) return { success: false, error: decision.message };

    /* Two renditions off one stored asset. The transcript pulls a
       width-limited, auto-format copy — a 2400px PNG screenshot served
       as an 800px WebP is a tenth of the bytes for every reader — and
       the full-size original is what opens on click. Both are unsigned
       delivery URLs on the public `upload` type, which is what makes
       them storable on the message rather than minted per read. The
       id is random, so the URL is unguessable, and that is the whole of
       the access control on it: the same footing profile pictures and
       project assets already stand on. */
    const attachment: ImageAttachment = {
      kind: "image",
      url: cloudinary.url(publicId, {
        secure: true,
        resource_type: "image",
        fetch_format: "auto",
        quality: "auto",
      }),
      previewUrl: cloudinary.url(publicId, {
        secure: true,
        resource_type: "image",
        fetch_format: "auto",
        quality: "auto",
        width: PREVIEW_WIDTH_PX,
        crop: "limit",
      }),
      width,
      height,
      alt: "Picture",
      provider: "cloudinary",
      providerId: publicId,
    };

    const maxImages = chatImageAllowance(await resolveChatImageLimit(caller.orgId));
    const orgRef = adminDb.collection("organizations").doc(caller.orgId);
    const messageRef = conversationRef.collection(MESSAGES).doc();

    const refused = await adminDb.runTransaction(async (tx) => {
      const orgSnap = await tx.get(orgRef);
      const usage = readChatImageUsage(orgSnap.data());

      /* The format was settled at signing. The bytes are the client's
         account and are checked again here because the file cap is the
         ceiling, and a ceiling checked only at the courtesy step is a
         suggestion. */
      const admission = admitChatImage({
        size: bytes,
        usedImages: usage.images,
        maxImages,
      });
      if (!admission.allowed) return admission.error ?? "That picture cannot be sent.";

      tx.set(messageRef, {
        senderId: caller.uid,
        text,
        attachment,
        createdAt: AdminTimestamp.now(),
        editedAt: null,
        deletedAt: null,
      });

      tx.update(conversationRef, {
        lastMessageAt: AdminTimestamp.now(),
        lastMessagePreview: text ? messagePreview(text) : attachmentPreview("image"),
        lastMessageBy: caller.uid,
      });

      tx.set(orgRef, { chatImageUsage: applyChatImageDelta(usage, bytes) }, { merge: true });
      return null;
    });

    if (refused) return { success: false, error: refused };

    return { success: true, conversationId };
  } catch (err: any) {
    console.error("[MessageAction] Failed to send picture:", err);
    return { success: false, error: "Could not send that picture." };
  }
}
