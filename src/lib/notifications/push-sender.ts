import { createHash } from "crypto";
import { adminDb, adminMessaging } from "@/lib/firebase/admin";

/* ------------------------------------------------------------------ */
/*  Sending a push                                                     */
/*                                                                     */
/*  Server-only. Runs after the thing it is telling somebody about has */
/*  already happened — the `calls` document is written first, and this */
/*  is fired at it afterwards without being awaited, because a push    */
/*  service having a slow morning must not delay a ring that is        */
/*  already landing on every open tab.                                 */
/*                                                                     */
/*  Which is the whole posture of this file: push is the LAST of three */
/*  ways a call reaches somebody, behind the in-app card and the       */
/*  desktop notification. Every failure here is swallowed, because     */
/*  none of them is a reason for a call not to be placed.              */
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

export interface CallPush {
  /** Who to ring. */
  toUid: string;
  fromName: string;
  /** Collapses repeats of one call into a single notification. */
  callId: string;
}

/**
 * Rings every device this person has registered.
 *
 * Fan-out is deliberate and not deduplicated: somebody signed in on a
 * laptop and a phone should have both ring, because the whole question
 * a call asks is "where are you". The service worker's `tag` collapses
 * duplicates per device, which is the level where a duplicate is
 * actually confusing.
 *
 * DATA ONLY, no `notification` block — see the note in
 * `public/firebase-messaging-sw.js`. A payload the browser renders
 * itself would put a second card on the screen of anyone who already
 * has the app open and got the real one.
 */
export async function sendCallPush(push: CallPush): Promise<void> {
  try {
    const snap = await adminDb
      .collection(PUSH_TOKENS)
      .where("uid", "==", push.toUid)
      .get();

    if (snap.empty) return;

    const tokens = snap.docs.map((doc) => doc.data().token as string).filter(Boolean);
    if (tokens.length === 0) return;

    const result = await adminMessaging.sendEachForMulticast({
      tokens,
      data: {
        title: `${push.fromName} is calling`,
        body: "Open OrbitOS to answer.",
        tag: `orbit-call-${push.callId}`,
        url: "/dashboard",
      },
      webpush: {
        headers: {
          TTL: String(CALL_PUSH_TTL_SECONDS),
          /* Wake a device that has gone to sleep to save battery. This
             is the header that separates a call from a newsletter, and
             push services throttle the ones that do not set it. */
          Urgency: "high",
        },
      },
    });

    /* Prune what will never work again, so a device somebody stopped
       using does not cost a failed send on every call from here on. */
    const dead = deadTokenIndexes(result.responses);
    if (dead.length === 0) return;

    const batch = adminDb.batch();
    for (const index of dead) batch.delete(snap.docs[index].ref);
    await batch.commit();
  } catch (err) {
    /* Never rethrown. The call itself is already placed and already
       ringing everywhere the app is open — this was the long shot. */
    console.error("[Push] Could not send call notification:", err);
  }
}
