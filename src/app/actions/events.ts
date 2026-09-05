"use server";

import { adminDb } from "@/lib/firebase/admin";
import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { logActivity } from "@/lib/telemetry";
import { createEventSchema, updateEventSchema } from "@/lib/validations/event";
import type { CreateEventInput, RsvpStatus, UpdateEventInput } from "@/types/event";
import type { ParticipantView } from "@/types/guest";
import { toDateKeyInZone } from "@/lib/utils/dates";
import { loadGuests, resolveGuestInvites } from "@/lib/guests/registry";
import { dispatchEngagementInvites, type DispatchReport } from "@/lib/calendar/invite-dispatch";
import { notifyOrganizerOfRsvp } from "@/lib/calendar/notify-organizer";
import { resolveGuestInviteLimit } from "@/lib/auth/permissions";
import { requireCaller } from "@/lib/auth/caller";

/* ------------------------------------------------------------------ */
/*  Engagement Server Actions                                          */
/*                                                                     */
/*  Mirrors the task actions: every write goes through the Admin SDK   */
/*  after an explicit org check, so Members are not blocked by rule    */
/*  evaluation and org isolation is enforced in one place.             */
/* ------------------------------------------------------------------ */

const EVENTS = "events";

type ActionResult = { success: true } | { success: false; error: string };

/**
 * What the caller needs to tell the organizer about delivery. Kept
 * separate from `success`: an engagement that saved but failed to mail
 * one address is still a created engagement, and reporting it as a
 * failure would push people into creating it a second time.
 */
export interface InviteOutcome {
  invitesSent: number;
  invitesFailed: number;
  /** Addresses rejected before send, so the organizer can fix a typo. */
  invalidEmails: string[];
  /**
   * Addresses the mail provider refused. Named rather than counted so the
   * organizer knows WHO to chase — "one invitation failed" on a nine
   * person engagement is not actionable information.
   */
  failedEmails: string[];
  /** Invited addresses that turned out to already be members. */
  promotedToMembers: number;
}

type CreateEventResult =
  | { success: true; data: string; invites: InviteOutcome }
  | { success: false; error: string };

type UpdateEventResult =
  | { success: true; invites: InviteOutcome }
  | { success: false; error: string };

function outcomeFrom(report: DispatchReport, invalid: string[], promoted: number): InviteOutcome {
  return {
    invitesSent: report.sent,
    invitesFailed: report.failed + report.skippedOverCeiling,
    invalidEmails: invalid,
    failedEmails: report.failures.map((failure) => failure.email),
    promotedToMembers: promoted,
  };
}

/* Both guards carry an explicit `ok` discriminant rather than relying on
   an `in` check — the narrowing is unambiguous and the call sites read
   the same way. */

type FoundEvent =
  | { ok: true; ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }
  | { ok: false; error: string };

/**
 * Who may change an engagement once it exists.
 *
 * Belonging to the org is enough to READ an engagement and to answer for
 * yourself, but not to alter one. Editing is not a read-adjacent action:
 * a reschedule re-invites every attendee and every outside guest, and
 * dropping someone pulls the entry off their calendar. Left open to any
 * member, one person could mail a workspace's entire client list.
 *
 * The organizer owns what they scheduled. An OWNER can also step in,
 * because somebody has to be able to clean up after whoever scheduled it
 * has left the company.
 */
function canManageEngagement(
  caller: { uid: string; role: string },
  event: FirebaseFirestore.DocumentData
): boolean {
  return event.createdBy === caller.uid || caller.role === "OWNER";
}

/** Loads an engagement and confirms it sits in the caller's organization. */
async function requireEventInOrg(eventId: string, orgId: string): Promise<FoundEvent> {
  const ref = adminDb.collection(EVENTS).doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Engagement not found." };
  if (snap.data()!.orgId !== orgId) return { ok: false, error: "Unauthorized." };
  return { ok: true, ref, data: snap.data()! };
}

/**
 * Tier gate for off-platform invitees.
 *
 * Only guests are counted. Members are seats the org already pays for and
 * cost nothing extra to include; a guest is a Resend send on create, on
 * every reschedule, and again on cancel. Returns an error string, or null
 * when the list is within the allowance.
 */
async function checkGuestAllowance(
  orgId: string,
  guestCount: number
): Promise<string | null> {
  if (guestCount === 0) return null;

  const limit = await resolveGuestInviteLimit(orgId);
  if (limit === -1 || guestCount <= limit) return null;

  if (limit === 0) {
    return "Inviting people outside your workspace requires a paid plan.";
  }
  return `Your plan allows ${limit} guest${limit === 1 ? "" : "s"} per engagement.`;
}

/* ------------------------------------------------------------------ */
/*  Create                                                             */
/* ------------------------------------------------------------------ */

export async function createEventAction(
  input: CreateEventInput
): Promise<CreateEventResult> {
  try {
    const parsed = createEventSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid engagement." };
    }
    const value = parsed.data;

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };
    const { uid } = caller;

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

    /* The day key is read in the ENGAGEMENT's zone, not the server's.
       This code runs in UTC in production, so a 01:00 engagement in
       Africa/Johannesburg would otherwise be filed under the previous
       day — and an all-day invite would reach every recipient's calendar
       dated a day early. */
    const timeZone = value.timeZone || "UTC";

    const guestGate = await checkGuestAllowance(caller.orgId, value.guests.length);
    if (guestGate) return { success: false, error: guestGate };

    /* Invited addresses are resolved BEFORE the attendee list is built.
       Anyone who turns out to hold an account in this workspace joins as
       a member rather than as a guest, so they get their real profile,
       their availability, and their existing feed instead of a second
       shadow identity. */
    const resolution = await resolveGuestInvites(caller.orgId, uid, value.guests);

    // Organizer is always an attendee, and is accepted by definition.
    const attendeeList = Array.from(
      new Set([...value.attendees, ...resolution.promotedUids, uid])
    );
    const rsvp: Record<string, RsvpStatus> = {};
    for (const attendee of attendeeList) {
      rsvp[attendee] = attendee === uid ? "accepted" : "pending";
    }

    const guestIds = resolution.guests.map((g) => g.id);
    const guestRsvp: Record<string, RsvpStatus> = {};
    const guestNames: Record<string, string> = {};
    for (const guest of resolution.guests) {
      guestRsvp[guest.id] = "pending";
      guestNames[guest.id] = guest.name;
    }

    const ref = await adminDb.collection(EVENTS).add({
      orgId: caller.orgId,
      projectId: value.projectId,
      title: value.title,
      description: value.description,
      startAt: AdminTimestamp.fromDate(startAt),
      endAt: AdminTimestamp.fromDate(new Date(value.endAt)),
      allDay: value.allDay,
      startDateKey: toDateKeyInZone(startAt, timeZone),
      timeZone,
      location: value.location || null,
      meetingUrl: value.meetingUrl || null,
      attendees: attendeeList,
      rsvp,
      guests: guestIds,
      guestRsvp,
      guestNames,
      // First issue of this UID. Every later invite must exceed it.
      sequence: 0,
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
        guestCount: guestIds.length,
      },
    });

    /* Dispatch runs after the commit, never inside it. A save that fails
       to mail is recoverable; mail that goes out for a save that failed
       puts entries on other people's calendars pointing at nothing. */
    const snap = await ref.get();
    const report = await dispatchEngagementInvites({
      eventId: ref.id,
      kind: "invite",
      event: snap.data()!,
      organizerUid: uid,
      orgId: caller.orgId,
    });

    return {
      success: true,
      data: ref.id,
      invites: outcomeFrom(report, resolution.invalid, resolution.promotedUids.length),
    };
  } catch (err: any) {
    console.error("[EventAction] Failed to create engagement:", err);
    return { success: false, error: err.message || "Failed to create engagement." };
  }
}

/* ------------------------------------------------------------------ */
/*  Update                                                             */
/* ------------------------------------------------------------------ */

export async function updateEventAction(
  eventId: string,
  updates: UpdateEventInput
): Promise<UpdateEventResult> {
  try {
    const parsed = updateEventSchema.safeParse(updates);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid engagement." };
    }
    const value = parsed.data;

    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };
    const { uid } = caller;

    const found = await requireEventInOrg(eventId, caller.orgId);
    if (!found.ok) return { success: false, error: found.error };

    if (!canManageEngagement(caller, found.data)) {
      return {
        success: false,
        error: "Only the organizer can change this engagement.",
      };
    }

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
    }
    if (value.endAt !== undefined) {
      patch.endAt = AdminTimestamp.fromDate(nextEnd);
    }

    /* The key is derived from the pair, so it has to be rewritten when
       EITHER half moves — re-zoning an engagement without touching its
       instant still changes the day it falls on, and a key left behind
       puts it in one cell of the grid while the .ics says another. */
    const nextZone =
      value.timeZone ?? ((found.data.timeZone as string) || "UTC");

    if (value.startAt !== undefined || value.timeZone !== undefined) {
      patch.startDateKey = toDateKeyInZone(nextStart, nextZone);
    }

    /* A change to the WHEN or the WHERE has to reach every calendar that
       already holds this engagement, and a client will only accept the
       resend if SEQUENCE has gone up. A description tweak does not clear
       that bar — mailing everyone because a typo was fixed trains people
       to ignore the next one that matters. */
    const materiallyChanged =
      value.startAt !== undefined ||
      value.endAt !== undefined ||
      value.allDay !== undefined ||
      value.timeZone !== undefined ||
      (value.title !== undefined && value.title !== found.data.title) ||
      (value.location !== undefined && (value.location || null) !== (found.data.location ?? null)) ||
      (value.meetingUrl !== undefined &&
        (value.meetingUrl || null) !== (found.data.meetingUrl ?? null));

    /* Re-syncing the RSVP map keeps it aligned with the attendee list:
       people added start at pending, people removed drop out, and
       everyone still invited keeps the answer they already gave. */
    const previousUids = (found.data.attendees ?? []) as string[];
    const previousGuestIds = (found.data.guests ?? []) as string[];

    let resolution = {
      guests: [] as { id: string; name: string }[],
      promotedUids: [] as string[],
      invalid: [] as string[],
    };
    let nextGuestIds = previousGuestIds;

    if (value.guests !== undefined) {
      const gate = await checkGuestAllowance(caller.orgId, value.guests.length);
      if (gate) return { success: false, error: gate };

      resolution = await resolveGuestInvites(caller.orgId, uid, value.guests);
      nextGuestIds = resolution.guests.map((g) => g.id);

      const previousGuestRsvp = (found.data.guestRsvp ?? {}) as Record<string, RsvpStatus>;
      const guestRsvp: Record<string, RsvpStatus> = {};
      const guestNames: Record<string, string> = {};
      for (const guest of resolution.guests) {
        guestRsvp[guest.id] = previousGuestRsvp[guest.id] ?? "pending";
        guestNames[guest.id] = guest.name;
      }

      patch.guests = nextGuestIds;
      patch.guestRsvp = guestRsvp;
      patch.guestNames = guestNames;
    }

    let nextUids = previousUids;

    if (value.attendees !== undefined || resolution.promotedUids.length > 0) {
      const base = value.attendees ?? previousUids;
      const attendeeList = Array.from(
        new Set([...base, ...resolution.promotedUids, found.data.createdBy as string])
      );
      const previous = (found.data.rsvp ?? {}) as Record<string, RsvpStatus>;
      const rsvp: Record<string, RsvpStatus> = {};
      for (const attendee of attendeeList) {
        rsvp[attendee] = previous[attendee] ?? "pending";
      }
      patch.attendees = attendeeList;
      patch.rsvp = rsvp;
      nextUids = attendeeList;
    }

    const addedUids = nextUids.filter((id) => !previousUids.includes(id));
    const addedGuestIds = nextGuestIds.filter((id) => !previousGuestIds.includes(id));
    const removedUids = previousUids.filter((id) => !nextUids.includes(id));
    const removedGuestIds = previousGuestIds.filter((id) => !nextGuestIds.includes(id));
    const anyoneRemoved = removedUids.length > 0 || removedGuestIds.length > 0;

    /* The bump covers a removal as well as a material change. A CANCEL is
       subject to the same dedupe rule as a reschedule — a client ignores
       it unless SEQUENCE has gone up — so dropping someone without
       bumping leaves the meeting sitting in their calendar for good. */
    const nextSequence = Number(found.data.sequence ?? 0) + 1;
    if (materiallyChanged || anyoneRemoved) {
      patch.sequence = nextSequence;
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

    /* Who hears about this, and why:
         - anyone dropped gets a CANCEL, because they are holding an entry
           for a meeting they are no longer part of and nothing else will
           ever take it off their calendar;
         - a material change goes to everyone still on it, because the
           entry they are holding is now wrong;
         - otherwise only people who were just added, because everyone
           else has nothing new to put in their calendar. */
    const fresh = await found.ref.get();
    const organizerUid = found.data.createdBy as string;

    let report: DispatchReport = { sent: 0, failed: 0, failures: [], skippedOverCeiling: 0 };

    /* Sent from the PRE-update snapshot on purpose. The dispatcher builds
       its recipient list out of the engagement's own attendee and guest
       arrays, and these people have just been taken off both — addressed
       from `fresh` there would be nobody left to send to. */
    if (anyoneRemoved) {
      await dispatchEngagementInvites({
        eventId,
        kind: "cancel",
        event: { ...found.data, sequence: nextSequence },
        organizerUid,
        orgId: caller.orgId,
        onlyTo: { uids: removedUids, guestIds: removedGuestIds },
      });
    }

    if (materiallyChanged) {
      report = await dispatchEngagementInvites({
        eventId,
        kind: "update",
        event: fresh.data()!,
        organizerUid,
        orgId: caller.orgId,
      });
    } else if (addedUids.length > 0 || addedGuestIds.length > 0) {
      report = await dispatchEngagementInvites({
        eventId,
        kind: "invite",
        event: fresh.data()!,
        organizerUid,
        orgId: caller.orgId,
        onlyTo: { uids: addedUids, guestIds: addedGuestIds },
      });
    }

    return {
      success: true,
      invites: outcomeFrom(report, resolution.invalid, resolution.promotedUids.length),
    };
  } catch (err: any) {
    console.error("[EventAction] Failed to update engagement:", err);
    return { success: false, error: err.message || "Failed to update engagement." };
  }
}

/* ------------------------------------------------------------------ */
/*  RSVP                                                               */
/* ------------------------------------------------------------------ */

export async function setRsvpAction(
  eventId: string,
  status: RsvpStatus
): Promise<ActionResult> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };
    const { uid } = caller;

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

    notifyOrganizerOfRsvp({
      organizerId: found.data.createdBy as string,
      event: {
        id: eventId,
        title: found.data.title as string,
        projectId: (found.data.projectId as string | null) ?? null,
      },
      subjectId: uid,
      subjectName: caller.name,
      subjectKind: "member",
      status,
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
  eventId: string
): Promise<ActionResult> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };
    const { uid } = caller;

    const found = await requireEventInOrg(eventId, caller.orgId);
    if (!found.ok) return { success: false, error: found.error };

    if (!canManageEngagement(caller, found.data)) {
      return {
        success: false,
        error: "Only the organizer can cancel this engagement.",
      };
    }

    if (found.data.status === "cancelled") return { success: true }; // idempotent

    /* A CANCEL that reuses the current SEQUENCE is ignored by the same
       clients that ignore a stale reschedule, leaving the meeting sitting
       in everyone's calendar. Bump first, then mail. */
    const sequence = Number(found.data.sequence ?? 0) + 1;

    await found.ref.update({
      status: "cancelled",
      sequence,
      updatedAt: AdminTimestamp.now(),
    });

    await logActivity({
      eventType: "ENGAGEMENT_CANCELLED",
      orgId: caller.orgId,
      projectId: (found.data.projectId as string | null) ?? null,
      actor: { uid, name: caller.name },
      metadata: { eventId, eventTitle: found.data.title },
    });

    // Everyone hears about a cancellation, including guests — a stale
    // entry on an outsider's calendar is the worst failure mode here.
    await dispatchEngagementInvites({
      eventId,
      kind: "cancel",
      event: { ...found.data, sequence, status: "cancelled" },
      organizerUid: found.data.createdBy as string,
      orgId: caller.orgId,
    });

    return { success: true };
  } catch (err: any) {
    console.error("[EventAction] Failed to cancel engagement:", err);
    return { success: false, error: err.message || "Failed to cancel engagement." };
  }
}

/* ------------------------------------------------------------------ */
/*  Guest participants                                                 */
/*                                                                     */
/*  Members arrive on the client already — they are in the org         */
/*  directory the calendar is holding anyway. Guests do not: the       */
/*  `guests` collection has no read rule, deliberately, because a      */
/*  client list is not something every Member should be able to        */
/*  enumerate by opening a console.                                    */
/*                                                                     */
/*  So the engagement stores guest IDS and this resolves them, gated   */
/*  on the caller being in the org that owns the engagement. Without   */
/*  it an organizer can invite an outside client and then have no way  */
/*  to see whether they accepted, which makes the answer they gave     */
/*  worthless.                                                         */
/* ------------------------------------------------------------------ */

type GuestsResult =
  | { success: true; data: ParticipantView[] }
  | { success: false; error: string };

export async function getEngagementGuestsAction(
  eventId: string
): Promise<GuestsResult> {
  try {
    const caller = await requireCaller();
    if (!caller.ok) return { success: false, error: caller.error };

    const found = await requireEventInOrg(eventId, caller.orgId);
    if (!found.ok) return { success: false, error: found.error };

    const guestIds = (found.data.guests ?? []) as string[];
    if (guestIds.length === 0) return { success: true, data: [] };

    const guestRsvp = (found.data.guestRsvp ?? {}) as Record<string, RsvpStatus>;
    const guests = await loadGuests(guestIds);

    return {
      success: true,
      data: guests.map((guest) => ({
        id: guest.id,
        name: guest.name,
        email: guest.email,
        kind: "guest" as const,
        rsvp: guestRsvp[guest.id] ?? "pending",
      })),
    };
  } catch (err: any) {
    console.error("[EventAction] Failed to load guests:", err);
    return { success: false, error: "Could not load the guest list." };
  }
}
