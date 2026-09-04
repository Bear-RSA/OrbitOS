"use server";

import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireServerUid } from "@/lib/auth/session";
import { dmConversationId, townHallConversationId } from "@/lib/messages/conversation-id";
import { canCreateGroup, canOpenDm } from "@/lib/messages/access";
import {
  MAX_GROUP_PARTICIPANTS,
  createGroupSchema,
  openDmSchema,
} from "@/lib/validations/messages";
import { TOWN_HALL_NAME } from "@/types/message";

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
      return { success: false, error: "That operative was not found." };
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
      return { success: false, error: "One of those operatives was not found." };
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
