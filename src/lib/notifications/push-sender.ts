import { createHash } from "crypto";
import { adminDb, adminMessaging } from "@/lib/firebase/admin";

/* ------------------------------------------------------------------ */
/*  Sending a push                                                     */
/*                                                                     */
/*  Server-only. Runs after the thing it is telling somebody about has */
/*  already happened — the `calls` document or the message is written  */
/*  first, and this is fired at it afterwards without being awaited,   */
/*  because a push service having a slow morning must not delay a ring */
/*  or a message that is already landing on every open tab.            */
/*                                                                     */
/*  Which is the whole posture of this file: push is the LAST way news */
/*  reaches somebody, behind the in-app card and the desktop           */
/*  notification. Every failure here is swallowed, because none of     */
/*  them is a reason for a call not to be placed or a line not sent.   */
/* ------------------------------------------------------------------ */

const PUSH_TOKENS = "pushTokens";

/**
 * How long a push is worth delivering.
 *
 * Matched to the ring timeout, and this is the field that stops the
 * feature being obnoxious. A device that was asleep when the call came
 * in must not wake up an hour later and announce a call that stopped
 * ringing before lunch — so the push service is told to drop it rather
 * than queue it. A missed call is information; a notification about a
 * missed call arriving as if it were live is a lie.
 */
const CALL_PUSH_TTL_SECONDS = 45;

/**
 * The document id for a token.
 *
 * Hashed rather than used raw. An FCM token is ~160 characters of
 * base64url — legal in a document id, but it is also a credential for
 * interrupting somebody, and a credential in a document id is a
 * credential in every log line and stack trace that mentions the path.
 */
export function pushTokenId(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

/**
 * Which of the tokens we just sent to are dead.
 *
 * Pure, so it can be tested without a push service. The distinction is
 * the point: a token that failed because Google had a bad minute must
 * be kept, and a token that failed because the browser it belonged to
 * was uninstalled must be dropped. Getting that backwards either
 * deletes everybody's registration on one outage, or keeps sending to
 * dead devices on every call forever.
 */
export function deadTokenIndexes(
  responses: { success: boolean; error?: { code?: string } }[]
): number[] {
  const DEAD = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
    "messaging/invalid-argument",
  ]);

  return responses
    .map((response, index) => ({ response, index }))
    .filter(({ response }) => !response.success && DEAD.has(response.error?.code ?? ""))
    .map(({ index }) => index);
}

/**
 * What a push says. Every field is a string because FCM data payloads
 * are string maps; the service worker reads these four and nothing else.
 */
export interface PushPayload {
  title: string;
  body: string;
  /** Collapse key: a second push with the same tag replaces the first card. */
  tag: string;
  /** Where tapping the card goes. */
  url: string;
}

/**
 * Most people one push may reach. A group is capped well below this, so
 * it only bites on a bug — which is the case it exists for: every
 * recipient is one Firestore read, and a fan-out to an entire workspace
 * by mistake should cost a bounded amount.
 */
const MAX_RECIPIENTS = 50;

/** Firestore's ceiling on an `in` filter. */
const IN_QUERY_LIMIT = 30;

/**
 * Sends one push to every device of every person listed.
 *
 * Fan-out is deliberate and not deduplicated: somebody signed in on a
 * laptop and a phone should hear about it on both. The service worker's
 * `tag` collapses duplicates per device, which is the level where a
 * duplicate is actually confusing.
 *
 * DATA ONLY, no `notification` block — see the note in
 * `public/firebase-messaging-sw.js`. A payload the browser renders
 * itself would put a second card on the screen of anyone who already
 * has the app open and got the real one.
 *
 * Never throws. Push always rides behind something that already
 * happened — a call placed, a message written — and none of its
 * failures is a reason to undo that.
 */
export async function sendPush(
  toUids: string[],
  payload: PushPayload,
  options: { ttlSeconds: number }
): Promise<void> {
  try {
    const uids = [...new Set(toUids)].slice(0, MAX_RECIPIENTS);
    if (uids.length === 0) return;

    const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    for (let i = 0; i < uids.length; i += IN_QUERY_LIMIT) {
      const snap = await adminDb
        .collection(PUSH_TOKENS)
        .where("uid", "in", uids.slice(i, i + IN_QUERY_LIMIT))
        .get();
      docs.push(...snap.docs);
    }

    const live = docs.filter((doc) => typeof doc.data().token === "string" && doc.data().token);
    if (live.length === 0) return;

    const result = await adminMessaging.sendEachForMulticast({
      tokens: live.map((doc) => doc.data().token as string),
      data: { ...payload },
      webpush: {
        headers: {
          TTL: String(options.ttlSeconds),
          /* Wake a device that has gone to sleep to save battery. Push
             services throttle a sender that does not set it, and both
             a call and a message are somebody waiting on you. */
          Urgency: "high",
        },
      },
    });

    /* Prune what will never work again, so a device somebody stopped
       using does not cost a failed send on every push from here on. */
    const dead = deadTokenIndexes(result.responses);
    if (dead.length === 0) return;

    const batch = adminDb.batch();
    for (const index of dead) batch.delete(live[index].ref);
    await batch.commit();
  } catch (err) {
    console.error("[Push] Could not send:", err);
  }
}

export interface CallPush {
  /** Who to ring. */
  toUid: string;
  fromName: string;
  /** Collapses repeats of one call into a single notification. */
  callId: string;
}

/** Rings every device this person has registered. */
export function sendCallPush(push: CallPush): Promise<void> {
  return sendPush(
    [push.toUid],
    {
      title: `${push.fromName} is calling`,
      body: "Open OrbitOS to answer.",
      tag: `orbit-call-${push.callId}`,
      url: "/dashboard",
    },
    { ttlSeconds: CALL_PUSH_TTL_SECONDS }
  );
}

/**
 * How long a message push is worth delivering. Unlike a ring, a message
 * is still news after a phone wakes from a flight — but not a week
 * later, when the app itself is the better place to catch up.
 */
const MESSAGE_PUSH_TTL_SECONDS = 24 * 60 * 60;

export interface MessagePush {
  toUids: string[];
  /** "Thandi" for a dm, "Thandi · Launch crew" for a group. */
  title: string;
  /** The text, already trimmed to a preview. */
  body: string;
  conversationId: string;
}

/**
 * Tells everybody in a thread that something was said in it. One card
 * per thread, replaced by the next message rather than stacked, so a
 * burst of ten lines is one notification showing the latest.
 */
export function sendMessagePush(push: MessagePush): Promise<void> {
  return sendPush(
    push.toUids,
    {
      title: push.title,
      body: push.body,
      tag: `orbit-thread-${push.conversationId}`,
      url: `/messages?c=${encodeURIComponent(push.conversationId)}`,
    },
    { ttlSeconds: MESSAGE_PUSH_TTL_SECONDS }
  );
}
