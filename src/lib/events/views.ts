import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";
import { effectiveCallProvider } from "@/lib/calls/scheduled";
import type { EngagementCallProvider, EventStatus, RsvpStatus } from "@/types/event";
import type { EventCaller } from "./core";

/* ------------------------------------------------------------------ */
/*  Engagement reads for the API                                       */
/*                                                                     */
/*  Shaped for a reader outside the app: instants as ISO strings,      */
/*  every attendee named with their answer, guests included. The app   */
/*  reads engagements straight from Firestore and never comes here.    */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

/** How far a list may reach, so one request cannot read a year of engagements. */
export const MAX_EVENT_WINDOW_DAYS = 62;

/**
 * An engagement that started before the window can still run into it.
 * Same reach-back `lib/calendar/free-busy` uses, for the same reason.
 */
const LOOKBACK_DAYS = 7;

export interface EventView {
  id: string;
  title: string;
  description: string;
  status: EventStatus;
  start: string;
  end: string;
  allDay: boolean;
  timeZone: string;
  location: string | null;
  callProvider: EngagementCallProvider;
  meetingUrl: string | null;
  projectId: string | null;
  organizer: { id: string; name: string };
  /** The caller's own answer, or null when they are not on it. */
  myRsvp: RsvpStatus | null;
  attendees: { id: string; name: string; rsvp: RsvpStatus }[];
  guests: { id: string; name: string; rsvp: RsvpStatus }[];
}

async function namesFor(uids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = Array.from(new Set(uids.filter(Boolean)));
  if (unique.length === 0) return names;
  const snaps = await adminDb.getAll(...unique.map((uid) => adminDb.collection("users").doc(uid)));
  for (const snap of snaps) if (snap.exists) names.set(snap.id, snap.data()?.name || "Unnamed member");
  return names;
}

function toIso(value: unknown): string {
  return value instanceof AdminTimestamp ? value.toDate().toISOString() : "";
}

async function toViews(
  caller: EventCaller,
  docs: FirebaseFirestore.DocumentSnapshot[]
): Promise<EventView[]> {
  const rows = docs.map((doc) => ({ id: doc.id, data: doc.data()! }));
  const uids: string[] = [];
  for (const { data } of rows) uids.push(data.createdBy, ...((data.attendees ?? []) as string[]));
  const names = await namesFor(uids);

  return rows.map(({ id, data }) => {
    const rsvp = (data.rsvp ?? {}) as Record<string, RsvpStatus>;
    const guestRsvp = (data.guestRsvp ?? {}) as Record<string, RsvpStatus>;
    const guestNames = (data.guestNames ?? {}) as Record<string, string>;
    const attendees = (data.attendees ?? []) as string[];

    return {
      id,
      title: data.title ?? "",
      description: data.description ?? "",
      status: data.status === "cancelled" ? "cancelled" : "confirmed",
      start: toIso(data.startAt),
      end: toIso(data.endAt),
      allDay: Boolean(data.allDay),
      timeZone: data.timeZone || "UTC",
      location: data.location ?? null,
      callProvider: effectiveCallProvider({
        callProvider: data.callProvider,
        meetingUrl: data.meetingUrl,
      }),
      meetingUrl: data.meetingUrl ?? null,
      projectId: data.projectId ?? null,
      organizer: { id: data.createdBy, name: names.get(data.createdBy) ?? "Unknown member" },
      myRsvp: attendees.includes(caller.uid) ? (rsvp[caller.uid] ?? "pending") : null,
      attendees: attendees.map((uid) => ({
        id: uid,
        name: names.get(uid) ?? "Unknown member",
        rsvp: rsvp[uid] ?? "pending",
      })),
      guests: ((data.guests ?? []) as string[]).map((guestId) => ({
        id: guestId,
        name: guestNames[guestId] ?? "Guest",
        rsvp: guestRsvp[guestId] ?? "pending",
      })),
    };
  });
}

export interface ListEventsFilter {
  from: Date;
  to: Date;
  /** "me" (default): only engagements the caller is on. "all": the whole workspace. */
  scope: "me" | "all";
  includeCancelled: boolean;
}

export type ListEventsResult =
  | { success: true; events: EventView[] }
  | { success: false; error: string };

/** Engagements overlapping the window, earliest first. */
export async function listEvents(caller: EventCaller, filter: ListEventsFilter): Promise<ListEventsResult> {
  const { from, to } = filter;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { success: false, error: '"from" and "to" must be ISO dates or date-times.' };
  }
  if (to <= from) return { success: false, error: '"to" must be after "from".' };
  if (to.getTime() - from.getTime() > MAX_EVENT_WINDOW_DAYS * DAY_MS) {
    return { success: false, error: `Ask for ${MAX_EVENT_WINDOW_DAYS} days or less at a time.` };
  }

  // Rides the deployed (orgId, startAt) composite index.
  const snap = await adminDb
    .collection("events")
    .where("orgId", "==", caller.orgId)
    .where("startAt", ">=", AdminTimestamp.fromMillis(from.getTime() - LOOKBACK_DAYS * DAY_MS))
    .where("startAt", "<", AdminTimestamp.fromDate(to))
    .get();

  const docs = snap.docs
    .filter((doc) => {
      const data = doc.data();
      if (!filter.includeCancelled && data.status === "cancelled") return false;
      if (filter.scope === "me" && !((data.attendees ?? []) as string[]).includes(caller.uid)) return false;
      const end = (data.endAt as AdminTimestamp | undefined)?.toDate();
      return !end || end > from;
    })
    .sort((a, b) => (a.data().startAt as AdminTimestamp).toMillis() - (b.data().startAt as AdminTimestamp).toMillis());

  return { success: true, events: await toViews(caller, docs) };
}

export async function getEvent(
  caller: EventCaller,
  eventId: string
): Promise<{ success: true; event: EventView } | { success: false; error: string }> {
  if (!eventId) return { success: false, error: "Event not found." };
  const snap = await adminDb.collection("events").doc(eventId).get();
  if (!snap.exists || snap.data()?.orgId !== caller.orgId) {
    return { success: false, error: "Event not found." };
  }
  const [event] = await toViews(caller, [snap]);
  return { success: true, event };
}
