import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { OrbitEvent } from "@/types/event";

const EVENTS_COLLECTION = "events";

/**
 * Chronological, with cancelled engagements sunk to the bottom so a
 * tombstone never leads a day.
 */
function sortEvents(events: OrbitEvent[]): OrbitEvent[] {
  return events.sort((a, b) => {
    const aDead = a.status === "cancelled";
    const bDead = b.status === "cancelled";
    if (aDead !== bDead) return aDead ? 1 : -1;
    return a.startAt.toMillis() - b.startAt.toMillis();
  });
}

/**
 * Live engagements for one project.
 *
 * Equality-only filters, sorted in memory — the same shape as the task
 * subscription, and it keeps this off the composite-index list.
 */
export function subscribeToEventsByProject(
  projectId: string,
  orgId: string,
  callback: (events: OrbitEvent[]) => void
) {
  const q = query(
    collection(db, EVENTS_COLLECTION),
    where("projectId", "==", projectId),
    where("orgId", "==", orgId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const events = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as OrbitEvent
      );
      callback(sortEvents(events));
    },
    (err) => {
      console.error("[Events Subscription Error]:", err);
      callback([]);
    }
  );
}

/**
 * Live engagements across the whole organization, project-scoped and
 * org-wide alike. Backs the workspace calendar.
 */
export function subscribeToEventsByOrg(
  orgId: string,
  callback: (events: OrbitEvent[]) => void
) {
  const q = query(collection(db, EVENTS_COLLECTION), where("orgId", "==", orgId));

  return onSnapshot(
    q,
    (snapshot) => {
      const events = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as OrbitEvent
      );
      callback(sortEvents(events));
    },
    (err) => {
      console.error("[Events Subscription Error]:", err);
      callback([]);
    }
  );
}

/**
 * Engagements overlapping [start, end).
 *
 * Firestore cannot express overlap directly — that needs a range on both
 * ends — so this filters on `startAt` and discards the tail client-side.
 * The result is every engagement that starts inside the window; anything
 * that started earlier and runs into it is caught by widening `start`.
 *
 * Requires the (orgId, startAt) composite index.
 */
export async function getEventsInRange(
  orgId: string,
  start: Date,
  end: Date
): Promise<OrbitEvent[]> {
  const q = query(
    collection(db, EVENTS_COLLECTION),
    where("orgId", "==", orgId),
    where("startAt", ">=", Timestamp.fromDate(start)),
    where("startAt", "<", Timestamp.fromDate(end))
  );

  const snapshot = await getDocs(q);
  const events = snapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as OrbitEvent
  );
  return sortEvents(events);
}

export async function getEventById(eventId: string): Promise<OrbitEvent | null> {
  const snap = await getDoc(doc(db, EVENTS_COLLECTION, eventId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as OrbitEvent;
}

/* ------------------------------------------------------------------ */
/*  Free/busy groundwork                                               */
/*                                                                     */
/*  Phase 4 turns these into slot suggestions. Kept here so the busy   */
/*  calculation has one definition rather than one per caller.         */
/* ------------------------------------------------------------------ */

export interface BusyRange {
  start: Date;
  end: Date;
}

/**
 * The merged busy ranges for one operative — cancelled engagements and
 * ones they are not on are ignored, and touching or overlapping spans
 * are collapsed so callers see a clean timeline.
 */
export function busyRangesFor(events: OrbitEvent[], uid: string): BusyRange[] {
  const spans = events
    .filter((e) => e.status !== "cancelled" && e.attendees.includes(uid))
    .map((e) => ({ start: e.startAt.toDate(), end: e.endAt.toDate() }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: BusyRange[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start.getTime() <= last.end.getTime()) {
      if (span.end > last.end) last.end = span.end;
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}
