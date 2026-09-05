"use server";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { feedUrlFor } from "@/lib/calendar/feed-token";
import { requireServerUid } from "@/lib/auth/session";

/* ------------------------------------------------------------------ */
/*  Calendar feed actions                                              */
/*                                                                     */
/*  The feed URL is derived, never stored — only the version counter   */
/*  lives on the user document, so there is no secret at rest to leak  */
/*  from Firestore. Rotating is a single increment.                    */
/*                                                                     */
/*  Derived, but still a capability: whoever holds the URL can read    */
/*  that operative's calendar without signing in. Both actions used to */
/*  take the uid to build it for, which meant any signed-in user could */
/*  ask for somebody else's feed URL and subscribe to their calendar,  */
/*  or rotate it and silently break the subscription they already had. */
/*  The uid comes from the session now, so these only ever act on the  */
/*  caller's own feed.                                                 */
/* ------------------------------------------------------------------ */

type FeedResult =
  | { success: true; url: string }
  | { success: false; error: string };

async function buildUrl(uid: string): Promise<FeedResult> {
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) return { success: false, error: "User not found." };

  const version = Number(snap.data()?.calendarFeedVersion ?? 0);
  return { success: true, url: feedUrlFor(uid, version) };
}

/** The current subscription URL for the calling operative. */
export async function getCalendarFeedAction(): Promise<FeedResult> {
  try {
    const uid = await requireServerUid();
    return await buildUrl(uid);
  } catch (err: any) {
    console.error("[CalendarAction] Failed to resolve feed URL:", err);
    return { success: false, error: err.message || "Could not resolve the feed URL." };
  }
}

/**
 * Invalidates every URL issued so far and returns the replacement.
 * Existing subscriptions will start 404ing until they are re-pointed —
 * that is the intent, so the copy around this needs to say so.
 */
export async function regenerateCalendarFeedAction(): Promise<FeedResult> {
  try {
    const uid = await requireServerUid();
    const ref = adminDb.collection("users").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: "User not found." };

    await ref.update({ calendarFeedVersion: FieldValue.increment(1) });
    return await buildUrl(uid);
  } catch (err: any) {
    console.error("[CalendarAction] Failed to rotate feed URL:", err);
    return { success: false, error: err.message || "Could not rotate the feed URL." };
  }
}
