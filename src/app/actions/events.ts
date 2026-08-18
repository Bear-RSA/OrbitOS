"use server";

import { adminDb } from "@/lib/firebase/admin";
import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { logActivity } from "@/lib/telemetry";
import { createEventSchema, updateEventSchema } from "@/lib/validations/event";
import type { CreateEventInput, RsvpStatus, UpdateEventInput } from "@/types/event";
import { toDateKey } from "@/lib/utils/dates";

/* ------------------------------------------------------------------ */
/*  Engagement Server Actions                                          */
/*                                                                     */
/*  Mirrors the task actions: every write goes through the Admin SDK   */
/*  after an explicit org check, so Members are not blocked by rule    */
/*  evaluation and org isolation is enforced in one place.             */
/* ------------------------------------------------------------------ */

const EVENTS = "events";

type ActionResult = { success: true } | { success: false; error: string };

type ActionResultWith<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/* Both guards carry an explicit `ok` discriminant rather than relying on
   an `in` check — the narrowing is unambiguous and the call sites read
   the same way. */

type Caller =
  | { ok: true; uid: string; orgId: string; name: string }
  | { ok: false; error: string };

type FoundEvent =
  | { ok: true; ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }
  | { ok: false; error: string };

/** Resolves the caller and guarantees they belong to an organization. */
async function requireCaller(uid: string): Promise<Caller> {
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) return { ok: false, error: "User not found." };

  const data = snap.data()!;
  if (!data.orgId) return { ok: false, error: "Unauthorized." };

  return {
    ok: true,
    uid,
    orgId: data.orgId as string,
    name: (data.name as string) || "Operative",
  };
}

/** Loads an engagement and confirms it sits in the caller's organization. */
async function requireEventInOrg(eventId: string, orgId: string): Promise<FoundEvent> {
  const ref = adminDb.collection(EVENTS).doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Engagement not found." };
  if (snap.data()!.orgId !== orgId) return { ok: false, error: "Unauthorized." };
  return { ok: true, ref, data: snap.data()! };
}

/* ------------------------------------------------------------------ */
/*  Create                                                             */
/* ------------------------------------------------------------------ */

export async function createEventAction(
  uid: string,
  input: CreateEventInput
): Promise<ActionResultWith<string>> {
  try {
    const parsed = createEventSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid engagement." };
    }
    const value = parsed.data;

    const caller = await requireCaller(uid);
    if (!caller.ok) return { success: false, error: caller.error };

    // A project-scoped engagement must point at a project in the same org.
    if (value.projectId) {
      const project = await adminDb.collection("projects").doc(value.projectId).get();
      if (!project.exists) return { success: false, error: "Project not found." };
      if (project.data()!.orgId !== caller.orgId) {
        return { success: false, error: "Unauthorized. Org mismatch." };
      }
    }

    const startAt = new Date(value.startAt);
    const now = AdminTimestamp.now();

    // Organizer is always an attendee, and is accepted by definition.
    const attendeeList = Array.from(new Set([...value.attendees, uid]));
    const rsvp: Record<string, RsvpStatus> = {};
    for (const attendee of attendeeList) {
      rsvp[attendee] = attendee === uid ? "accepted" : "pending";
    }

    const ref = await adminDb.collection(EVENTS).add({
      orgId: caller.orgId,
      projectId: value.projectId,
      title: value.title,
      description: value.description,
      startAt: AdminTimestamp.fromDate(startAt),
      endAt: AdminTimestamp.fromDate(new Date(value.endAt)),
      allDay: value.allDay,
      startDateKey: toDateKey(startAt),
      timeZone: value.timeZone || "UTC",
      location: value.location || null,
      meetingUrl: value.meetingUrl || null,
      attendees: attendeeList,
      rsvp,
      status: "confirmed",
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity({
      eventType: "ENGAGEMENT_SCHEDULED",
      orgId: caller.orgId,
      projectId: value.projectId,
      actor: { uid, name: caller.name },
      metadata: {
        eventId: ref.id,
        eventTitle: value.title,
        attendeeCount: attendeeList.length,
      },
    });

    return { success: true, data: ref.id };
  } catch (err: any) {
    console.error("[EventAction] Failed to create engagement:", err);
    return { success: false, error: err.message || "Failed to create engagement." };
  }
}

/* ------------------------------------------------------------------ */
/*  Update                                                             */
/* ------------------------------------------------------------------ */

export async function updateEventAction(
  uid: string,
  eventId: string,
  updates: UpdateEventInput
): Promise<ActionResult> {
  try {
    const parsed = updateEventSchema.safeParse(updates);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid engagement." };
    }
    const value = parsed.data;

    const caller = await requireCaller(uid);
    if (!caller.ok) return { success: false, error: caller.error };

    const found = await requireEventInOrg(eventId, caller.orgId);
    if (!found.ok) return { success: false, error: found.error };

    /* One end of the span may be edited alone, so validate the result
       against what is already stored rather than only what was sent. */
    const nextStart = value.startAt
      ? new Date(value.startAt)
      : (found.data.startAt as FirebaseFirestore.Timestamp).toDate();
    const nextEnd = value.endAt
      ? new Date(value.endAt)
      : (found.data.endAt as FirebaseFirestore.Timestamp).toDate();

    if (nextEnd <= nextStart) {
      return { success: false, error: "The end must come after the start." };
    }

    const patch: Record<string, any> = { updatedAt: AdminTimestamp.now() };

    if (value.title !== undefined) patch.title = value.title;
    if (value.description !== undefined) patch.description = value.description;
    if (value.allDay !== undefined) patch.allDay = value.allDay;
    if (value.timeZone !== undefined) patch.timeZone = value.timeZone;
    if (value.location !== undefined) patch.location = value.location || null;
    if (value.meetingUrl !== undefined) patch.meetingUrl = value.meetingUrl || null;

    if (value.startAt !== undefined) {
      patch.startAt = AdminTimestamp.fromDate(nextStart);
      patch.startDateKey = toDateKey(nextStart);
    }
    if (value.endAt !== undefined) {
      patch.endAt = AdminTimestamp.fromDate(nextEnd);
    }

    /* Re-syncing the RSVP map keeps it aligned with the attendee list:
       people added start at pending, people removed drop out, and
       everyone still invited keeps the answer they already gave. */
    if (value.attendees !== undefined) {
      const attendeeList = Array.from(
        new Set([...value.attendees, found.data.createdBy as string])
      );
      const previous = (found.data.rsvp ?? {}) as Record<string, RsvpStatus>;
      const rsvp: Record<string, RsvpStatus> = {};
      for (const attendee of attendeeList) {
        rsvp[attendee] = previous[attendee] ?? "pending";
      }
      patch.attendees = attendeeList;
      patch.rsvp = rsvp;
    }

    await found.ref.update(patch);

    await logActivity({
      eventType: "ENGAGEMENT_REVISED",
      orgId: caller.orgId,
      projectId: (found.data.projectId as string | null) ?? null,
      actor: { uid, name: caller.name },
      metadata: {
        eventId,
        eventTitle: value.title ?? found.data.title,
        rescheduled: value.startAt !== undefined || value.endAt !== undefined,
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error("[EventAction] Failed to update engagement:", err);
    return { success: false, error: err.message || "Failed to update engagement." };
  }
}

/* ------------------------------------------------------------------ */
/*  RSVP                                                               */
/* ------------------------------------------------------------------ */

export async function setRsvpAction(
  uid: string,
  eventId: string,
  status: RsvpStatus
): Promise<ActionResult> {
  try {
    const caller = await requireCaller(uid);
    if (!caller.ok) return { success: false, error: caller.error };

    const found = await requireEventInOrg(eventId, caller.orgId);
    if (!found.ok) return { success: false, error: found.error };

    const attendeeList = (found.data.attendees ?? []) as string[];
    if (!attendeeList.includes(uid)) {
      return { success: false, error: "You are not on this engagement." };
    }
    if (found.data.status === "cancelled") {
      return { success: false, error: "This engagement was cancelled." };
    }

    await found.ref.update({
      // Dotted path so concurrent RSVPs do not overwrite each other.
      [`rsvp.${uid}`]: status,
      updatedAt: AdminTimestamp.now(),
    });

    await logActivity({
      eventType: "RSVP_RECORDED",
      orgId: caller.orgId,
      projectId: (found.data.projectId as string | null) ?? null,
      actor: { uid, name: caller.name },
      metadata: { eventId, eventTitle: found.data.title, rsvp: status },
    });

    return { success: true };
  } catch (err: any) {
    console.error("[EventAction] Failed to record RSVP:", err);
    return { success: false, error: err.message || "Failed to record RSVP." };
  }
}

/* ------------------------------------------------------------------ */
/*  Cancel                                                             */
/*                                                                     */
/*  A tombstone rather than a delete, so links and the activity log    */
/*  still resolve after the fact.                                      */
/* ------------------------------------------------------------------ */

export async function cancelEventAction(
  uid: string,
  eventId: string
): Promise<ActionResult> {
  try {
    const caller = await requireCaller(uid);
    if (!caller.ok) return { success: false, error: caller.error };

    const found = await requireEventInOrg(eventId, caller.orgId);
    if (!found.ok) return { success: false, error: found.error };

    if (found.data.status === "cancelled") return { success: true }; // idempotent

    await found.ref.update({
      status: "cancelled",
      updatedAt: AdminTimestamp.now(),
    });

    await logActivity({
      eventType: "ENGAGEMENT_CANCELLED",
      orgId: caller.orgId,
      projectId: (found.data.projectId as string | null) ?? null,
      actor: { uid, name: caller.name },
      metadata: { eventId, eventTitle: found.data.title },
    });

    return { success: true };
  } catch (err: any) {
    console.error("[EventAction] Failed to cancel engagement:", err);
    return { success: false, error: err.message || "Failed to cancel engagement." };
  }
}
