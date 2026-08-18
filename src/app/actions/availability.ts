"use server";

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import {
  DEFAULT_WORKING_HOURS,
  findSlots,
  mergeRanges,
  TimeRange,
} from "@/lib/calendar/availability";

/* ------------------------------------------------------------------ */
/*  Availability                                                       */
/*                                                                     */
/*  OrbitOS's own free/busy. Google needs `freebusy.query` because it  */
/*  cannot see inside other people's calendars; here every engagement  */
/*  is already in one collection, so availability is a range read plus */
/*  the filter chain in lib/calendar/availability.                     */
/* ------------------------------------------------------------------ */

/**
 * An engagement starting before the window can still run into it. The
 * query filters on `startAt`, so it reaches back far enough to catch
 * those. A multi-day block beginning earlier than this is missed —
 * acceptable while engagements are meetings rather than site visits.
 */
const LOOKBACK_DAYS = 7;
const DAY_MS = 86_400_000;

export interface AvailabilityRequest {
  /** Everyone who has to be there. The caller is included automatically. */
  attendees: string[];
  /** ISO instants bounding the search. */
  from: string;
  to: string;
  durationMins: number;
  bufferMins?: number;
  minimumNoticeMins?: number;
  granularityMins?: number;
  limit?: number;
}

export interface AvailabilitySlot {
  start: string;
  end: string;
}

export interface AvailabilityData {
  slots: AvailabilitySlot[];
  /** Union of everyone's commitments, for conflict highlighting. */
  busy: AvailabilitySlot[];
  /** Attendees with nothing free in the window, by uid. */
  fullyBooked: string[];
}

type AvailabilityResult =
  | { success: true; data: AvailabilityData }
  | { success: false; error: string };

const iso = (r: TimeRange): AvailabilitySlot => ({
  start: r.start.toISOString(),
  end: r.end.toISOString(),
});

export async function getAvailabilityAction(
  uid: string,
  request: AvailabilityRequest
): Promise<AvailabilityResult> {
  try {
    const from = new Date(request.from);
    const to = new Date(request.to);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { success: false, error: "Invalid search window." };
    }
    if (to <= from) {
      return { success: false, error: "The window must end after it starts." };
    }
    if (to.getTime() - from.getTime() > 60 * DAY_MS) {
      return { success: false, error: "Search a window of 60 days or less." };
    }
    if (request.durationMins <= 0 || request.durationMins > 24 * 60) {
      return { success: false, error: "Duration must be between 1 minute and 24 hours." };
    }

    const callerSnap = await adminDb.collection("users").doc(uid).get();
    if (!callerSnap.exists) return { success: false, error: "User not found." };

    const orgId = callerSnap.data()?.orgId;
    if (!orgId) return { success: false, error: "Unauthorized." };

    // The organizer is always in the room.
    const participants = Array.from(new Set([...request.attendees, uid]));

    /* Everyone must be in the caller's org — otherwise this would report
       one workspace's schedule to another. */
    const participantDocs = await Promise.all(
      participants.map((id) => adminDb.collection("users").doc(id).get())
    );
    for (const doc of participantDocs) {
      if (!doc.exists || doc.data()?.orgId !== orgId) {
        return { success: false, error: "Unauthorized. Attendee outside this workspace." };
      }
    }

    // Rides the deployed (orgId, startAt) composite index.
    const snapshot = await adminDb
      .collection("events")
      .where("orgId", "==", orgId)
      .where("startAt", ">=", Timestamp.fromMillis(from.getTime() - LOOKBACK_DAYS * DAY_MS))
      .where("startAt", "<", Timestamp.fromMillis(to.getTime()))
      .get();

    const participantSet = new Set(participants);
    const perMember = new Map<string, TimeRange[]>(
      participants.map((id) => [id, [] as TimeRange[]])
    );

    for (const doc of snapshot.docs) {
      const event = doc.data();
      if (event.status === "cancelled") continue;
      if (!event.startAt || !event.endAt) continue;

      const range: TimeRange = {
        start: (event.startAt as Timestamp).toDate(),
        end: (event.endAt as Timestamp).toDate(),
      };
      if (range.end <= from || range.start >= to) continue; // no overlap

      for (const attendee of (event.attendees ?? []) as string[]) {
        if (participantSet.has(attendee)) perMember.get(attendee)!.push(range);
      }
    }

    // A slot has to be free for everyone, so the union is what blocks it.
    const union = mergeRanges([...perMember.values()].flat());

    const slots = findSlots(
      union,
      { start: from, end: to },
      {
        durationMins: request.durationMins,
        bufferMins: request.bufferMins ?? 0,
        minimumNoticeMins: request.minimumNoticeMins ?? 0,
        granularityMins: request.granularityMins ?? 15,
        workingHours: DEFAULT_WORKING_HOURS,
        limit: request.limit ?? 12,
      }
    );

    /* Reported so the UI can name who is the constraint rather than just
       saying nothing is available. */
    const fullyBooked = participants.filter((id) => {
      const ranges = mergeRanges(perMember.get(id) ?? []);
      if (ranges.length === 0) return false;
      return (
        findSlots(ranges, { start: from, end: to }, {
          durationMins: request.durationMins,
          bufferMins: request.bufferMins ?? 0,
          minimumNoticeMins: request.minimumNoticeMins ?? 0,
          granularityMins: request.granularityMins ?? 15,
          workingHours: DEFAULT_WORKING_HOURS,
          limit: 1,
        }).length === 0
      );
    });

    return {
      success: true,
      data: {
        slots: slots.map(iso),
        busy: union.map(iso),
        fullyBooked,
      },
    };
  } catch (err: any) {
    console.error("[AvailabilityAction] Failed to compute availability:", err);
    return { success: false, error: err.message || "Could not compute availability." };
  }
}
