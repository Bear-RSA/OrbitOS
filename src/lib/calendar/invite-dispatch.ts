import { adminDb } from "@/lib/firebase/admin";
import { loadGuests } from "@/lib/guests/registry";
import { rsvpUrlFor } from "@/lib/calendar/rsvp-token";
import type { IcsAttendee, IcsPartStat } from "@/lib/calendar/ics";
import {
  sendEngagementInvite,
  type EngagementForInvite,
  type InviteKind,
} from "@/lib/email/sendEngagementInvite";
import type { RsvpStatus } from "@/types/event";

/* ------------------------------------------------------------------ */
/*  Invite dispatch                                                    */
/*                                                                     */
/*  Fans one engagement out to everybody who needs to know about it.   */
/*                                                                     */
/*  Dispatch is deliberately NOT part of the write transaction. An     */
/*  engagement that saved but failed to email is a recoverable         */
/*  annoyance — resend it. An engagement that emailed twenty people    */
/*  and then failed to save is twenty calendar entries pointing at     */
/*  nothing. So the write commits first and this runs after, with      */
/*  failures logged and reported rather than thrown.                   */
/* ------------------------------------------------------------------ */

/**
 * Hard ceiling on recipients per dispatch. ALWAYS on, independent of
 * BILLING_GUARDRAILS_ENABLED, because this one maps to a real invoice:
 * every recipient is a Resend send plus the reads to resolve them. The
 * attendee schema already caps a list at 50; this is the backstop for a
 * caller that finds a way around it.
 */
const HARD_MAX_RECIPIENTS = 60;

/** Sent in parallel, but in bounded waves so a large invite list does
    not open sixty sockets at once or trip Resend's rate limit. */
const WAVE_SIZE = 8;

const PART_STAT: Record<RsvpStatus, IcsPartStat> = {
  pending: "NEEDS-ACTION",
  accepted: "ACCEPTED",
  declined: "DECLINED",
  tentative: "TENTATIVE",
};

export interface DispatchParams {
  eventId: string;
  kind: InviteKind;
  /** The stored engagement document. */
  event: FirebaseFirestore.DocumentData;
  organizerUid: string;
  orgId: string;
  /**
   * Restricts the send to these member uids and guest ids. Used on an
   * update so newly added people get an invitation while everyone else
   * is left alone — omit it to reach the whole list, which is what a
   * reschedule or a cancellation wants.
   */
  onlyTo?: { uids?: string[]; guestIds?: string[] };
}

export interface DispatchReport {
  sent: number;
  failed: number;
  /** Addresses that did not go out, for surfacing back to the organizer. */
  failures: { email: string; error: string }[];
  skippedOverCeiling: number;
}

/**
 * Sends the engagement to its members and guests.
 *
 * Never throws: a delivery problem must not roll back an engagement that
 * is already saved and already correct in the app.
 */
export async function dispatchEngagementInvites(
  params: DispatchParams
): Promise<DispatchReport> {
  const report: DispatchReport = { sent: 0, failed: 0, failures: [], skippedOverCeiling: 0 };

  try {
    const { event, eventId, organizerUid, orgId, kind, onlyTo } = params;

    const memberUids = ((event.attendees ?? []) as string[]).filter(
      // The organizer already has this in the app and on their own feed;
      // mailing them their own invitation is noise.
      (uid) => uid !== organizerUid
    );
    const guestIds = (event.guests ?? []) as string[];

    const targetUids = onlyTo?.uids
      ? memberUids.filter((uid) => onlyTo.uids!.includes(uid))
      : memberUids;
    const targetGuestIds = onlyTo?.guestIds
      ? guestIds.filter((id) => onlyTo.guestIds!.includes(id))
      : guestIds;

    if (targetUids.length === 0 && targetGuestIds.length === 0) return report;

    /* Everyone is loaded, not just the targets — the ATTENDEE block in
       the .ics has to list the full room, or a recipient's calendar
       shows a meeting that looks like it is just the two of them. */
    const [organizerSnap, orgSnap, memberSnaps, allGuests] = await Promise.all([
      adminDb.collection("users").doc(organizerUid).get(),
      adminDb.collection("organizations").doc(orgId).get(),
      memberUids.length
        ? adminDb.getAll(...memberUids.map((uid) => adminDb.collection("users").doc(uid)))
        : Promise.resolve([]),
      loadGuests(guestIds),
    ]);

    if (!organizerSnap.exists) return report;
    const organizerData = organizerSnap.data()!;
    const organizer = {
      name: (organizerData.name as string) || "OrbitOS",
      email: organizerData.email as string,
    };
    if (!organizer.email) return report;

    const rsvp = (event.rsvp ?? {}) as Record<string, RsvpStatus>;
    const guestRsvp = (event.guestRsvp ?? {}) as Record<string, RsvpStatus>;

    const memberById = new Map(
      memberSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()!])
    );
    const guestById = new Map(allGuests.map((g) => [g.id, g]));

    /* ---- The full room, for the .ics ATTENDEE lines ---- */
    const attendeeList: IcsAttendee[] = [];

    attendeeList.push({
      name: organizer.name,
      email: organizer.email,
      partStat: "ACCEPTED",
      rsvp: false,
    });

    for (const uid of memberUids) {
      const member = memberById.get(uid);
      if (!member?.email) continue;
      attendeeList.push({
        name: (member.name as string) || undefined,
        email: member.email as string,
        partStat: PART_STAT[rsvp[uid] ?? "pending"],
      });
    }

    for (const guest of allGuests) {
      attendeeList.push({
        name: guest.name,
        email: guest.email,
        partStat: PART_STAT[guestRsvp[guest.id] ?? "pending"],
      });
    }

    const engagement: EngagementForInvite = {
      id: eventId,
      title: event.title as string,
      description: (event.description as string) || null,
      startAt: (event.startAt as FirebaseFirestore.Timestamp).toDate(),
      endAt: (event.endAt as FirebaseFirestore.Timestamp).toDate(),
      allDay: Boolean(event.allDay),
      startDateKey: event.startDateKey as string,
      timeZone: (event.timeZone as string) || "UTC",
      location: (event.location as string) || null,
      meetingUrl: (event.meetingUrl as string) || null,
      sequence: Number(event.sequence ?? 0),
    };

    const orgName = orgSnap.exists ? (orgSnap.data()!.name as string) : undefined;

    /* ---- The people this particular dispatch actually mails ---- */
    type Target = { email: string; name: string; url: string; kind: "member" | "guest" };
    const targets: Target[] = [];

    for (const uid of targetUids) {
      const member = memberById.get(uid);
      if (!member?.email) continue;
      targets.push({
        email: member.email as string,
        name: (member.name as string) || "Operative",
        // Reuses calendarFeedVersion so rotating a feed also kills any
        // RSVP link already sitting in that person's inbox.
        url: rsvpUrlFor("member", uid, eventId, Number(member.calendarFeedVersion ?? 0)),
        kind: "member",
      });
    }

    for (const id of targetGuestIds) {
      const guest = guestById.get(id);
      if (!guest) continue;
      targets.push({
        email: guest.email,
        name: guest.name,
        url: rsvpUrlFor("guest", id, eventId, guest.tokenVersion),
        kind: "guest",
      });
    }

    let capped = targets;
    if (targets.length > HARD_MAX_RECIPIENTS) {
      report.skippedOverCeiling = targets.length - HARD_MAX_RECIPIENTS;
      capped = targets.slice(0, HARD_MAX_RECIPIENTS);
      console.warn(
        `[InviteDispatch] ${eventId}: ${targets.length} recipients exceeds the ceiling of ${HARD_MAX_RECIPIENTS}; ${report.skippedOverCeiling} not mailed.`
      );
    }

    for (let i = 0; i < capped.length; i += WAVE_SIZE) {
      const wave = capped.slice(i, i + WAVE_SIZE);
      const results = await Promise.all(
        wave.map((target) =>
          sendEngagementInvite({
            kind,
            engagement,
            organizer,
            orgName,
            attendeeList,
            recipient: {
              email: target.email,
              name: target.name,
              rsvpUrl: target.url,
              kind: target.kind,
            },
          })
        )
      );

      results.forEach((result, index) => {
        if (result.success) {
          report.sent++;
        } else {
          report.failed++;
          report.failures.push({ email: wave[index].email, error: result.error });
        }
      });
    }

    return report;
  } catch (err: any) {
    console.error("[InviteDispatch] Dispatch failed:", err);
    return report;
  }
}
