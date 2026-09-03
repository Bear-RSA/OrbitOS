import { collection, query, where, onSnapshot, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { OrbitCall } from "@/types/call";

const CALLS_COLLECTION = "calls";

/* ------------------------------------------------------------------ */
/*  Call subscriptions                                                 */
/*                                                                     */
/*  Equality-only filters, sorted in memory — the same shape as the    */
/*  engagement and task subscriptions, and it keeps these off the      */
/*  composite-index list.                                              */
/* ------------------------------------------------------------------ */

function toCalls(docs: { id: string; data: () => any }[]): OrbitCall[] {
  return docs
    .map((d) => ({ id: d.id, ...d.data() }) as OrbitCall)
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

/**
 * Calls ringing this user right now.
 *
 * This is the listener that makes a phone ring, so it is deliberately
 * the narrowest query in the app: one uid, one status. It runs for the
 * whole session on every signed-in client, and anything broader would
 * mean paying reads on other people's calls to find out about your own.
 */
export function subscribeToIncomingCalls(
  uid: string,
  callback: (calls: OrbitCall[]) => void
) {
  const q = query(
    collection(db, CALLS_COLLECTION),
    where("to", "==", uid),
    where("status", "==", "ringing")
  );

  return onSnapshot(
    q,
    (snapshot) => callback(toCalls(snapshot.docs)),
    (err) => {
      console.error("[Calls Subscription Error]:", err);
      callback([]);
    }
  );
}

/**
 * Calls this user placed that are still ringing.
 *
 * The caller's side of the same conversation: it is how their screen
 * learns the other person declined, and how it stops ringing when they
 * pick up somewhere else.
 */
export function subscribeToOutgoingCalls(
  uid: string,
  callback: (calls: OrbitCall[]) => void
) {
  const q = query(
    collection(db, CALLS_COLLECTION),
    where("from", "==", uid),
    where("status", "==", "ringing")
  );

  return onSnapshot(
    q,
    (snapshot) => callback(toCalls(snapshot.docs)),
    (err) => {
      console.error("[Calls Subscription Error]:", err);
      callback([]);
    }
  );
}

/**
 * Live direct calls across the workspace.
 *
 * Backs the "on a call" state in the Personnel Network, so a teammate
 * shows as busy without anyone setting a status by hand — the same
 * bargain `lib/calendar/presence` makes with the calendar.
 */
export function subscribeToActiveCalls(
  orgId: string,
  callback: (calls: OrbitCall[]) => void
) {
  const q = query(
    collection(db, CALLS_COLLECTION),
    where("orgId", "==", orgId),
    where("status", "==", "active")
  );

  return onSnapshot(
    q,
    (snapshot) => callback(toCalls(snapshot.docs)),
    (err) => {
      console.error("[Calls Subscription Error]:", err);
      callback([]);
    }
  );
}

/**
 * One call document, live.
 *
 * The caller's side of a ring. `subscribeToOutgoingCalls` cannot serve
 * this: the moment the callee answers, the status leaves `ringing` and
 * the row drops out of that query — which is precisely the transition
 * the caller is waiting to see.
 */
export function subscribeToCall(
  callId: string,
  callback: (call: OrbitCall | null) => void
) {
  return onSnapshot(
    doc(db, CALLS_COLLECTION, callId),
    (snap) => callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as OrbitCall) : null),
    (err) => {
      console.error("[Call Subscription Error]:", err);
      callback(null);
    }
  );
}
