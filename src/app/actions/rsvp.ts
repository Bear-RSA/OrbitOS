"use server";

import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { logActivity } from "@/lib/telemetry";
import { verifyRsvpToken, type RsvpIdentity } from "@/lib/calendar/rsvp-token";
import { notifyOrganizerOfRsvp } from "@/lib/calendar/notify-organizer";
import { resolveCallLimits } from "@/lib/auth/permissions";
import { canJoinScheduledCall } from "@/lib/calls/access";
import { grantFor } from "@/lib/calls/grant";
import { sanitizeDisplayName } from "@/lib/calls/display-name";
import {
  effectiveCallProvider,
  scheduledCallMinutes,
  scheduledCallSeats,
} from "@/lib/calls/scheduled";
import { guestJoinSchema } from "@/lib/validations/call";
import type { CallGrant } from "@/types/call";
import type { EngagementCallProvider, RsvpStatus } from "@/types/event";

/* ------------------------------------------------------------------ */
/*  Token RSVP                                                         */
/*                                                                     */
/*  The reply path for someone answering from their inbox. A guest has */
/*  no session to check, so the signed link IS the authorization —     */
/*  which makes the checks here the only thing standing between a      */
/*  forwarded email and a stranger writing to the engagement.          */
/*                                                                     */
/*  Four gates, and all four are load-bearing:                         */
/*    1. the signature holds (we issued this link);                    */
/*    2. the subject's version still matches (it has not been revoked);*/
/*    3. the subject is actually on THIS engagement;                   */
/*    4. the engagement is live.                                       */
/*                                                                     */
/*  Failures are deliberately indistinguishable from one another. A    */
/*  link that reports "wrong version" rather than "not found" tells an */
/*  attacker their guess was structurally right.                       */
/* ------------------------------------------------------------------ */

const RSVP_VALUES: RsvpStatus[] = ["accepted", "declined", "tentative"];

export interface RsvpContext {
  eventId: string;
  title: string;
  description: string | null;
  /** ISO — the client renders in the engagement's zone. */
  startAt: string;
  endAt: string;
  allDay: boolean;
  timeZone: string;
  location: string | null;
  meetingUrl: string | null;
  /** "orbit" means the page can offer a way in, not just a link out. */
  callProvider: EngagementCallProvider;
  organizerName: string;
  orgName: string | null;
  /** Who the link says you are. */
  subjectName: string;
  subjectKind: "member" | "guest";
  current: RsvpStatus;
  cancelled: boolean;
}

type ContextResult =
  | { success: true; data: RsvpContext }
  | { success: false; error: string };

type SubmitResult =
  | { success: true; status: RsvpStatus }
  | { success: false; error: string };

/** One message for every rejection, by design. */
const DEAD_LINK = "This invitation link is no longer valid.";

interface Subject {
  id: string;
  kind: "member" | "guest";
  name: string;
  orgId: string;
}

/**
 * Resolves the token to a live subject, or null. Combines gates 1 and 2 —
 * the signature proves we issued the link, the version proves it has not
 * since been revoked.
 */
async function resolveSubject(identity: RsvpIdentity): Promise<Subject | null> {
  if (identity.kind === "member") {
    const snap = await adminDb.collection("users").doc(identity.subjectId).get();
    if (!snap.exists) return null;

    const data = snap.data()!;
    if (Number(data.calendarFeedVersion ?? 0) !== identity.version) return null;
    if (!data.orgId) return null;

    return {
      id: snap.id,
      kind: "member",
      name: (data.name as string) || "Operative",
      orgId: data.orgId as string,
    };
  }

  const snap = await adminDb.collection("guests").doc(identity.subjectId).get();
  if (!snap.exists) return null;

  const data = snap.data()!;
  if (Number(data.tokenVersion ?? 0) !== identity.version) return null;

  return {
    id: snap.id,
    kind: "guest",
    name: (data.name as string) || "Guest",
    orgId: data.orgId as string,
  };
}

/** Gate 3 — is this subject genuinely on this engagement? */
function isOnEngagement(event: FirebaseFirestore.DocumentData, subject: Subject): boolean {
  const list =
    subject.kind === "member"
      ? ((event.attendees ?? []) as string[])
      : ((event.guests ?? []) as string[]);
  return list.includes(subject.id);
}

/** Everything the RSVP page needs to render, resolved from the token alone. */
export async function getRsvpContextAction(token: string): Promise<ContextResult> {
  try {
    let identity: RsvpIdentity | null;
    try {
      identity = verifyRsvpToken(token);
    } catch (err) {
      // A missing secret is a deployment fault, not a bad link.
      console.error("[Rsvp] Token verification unavailable:", err);
      return { success: false, error: "RSVP is not configured on this deployment." };
    }
    if (!identity) return { success: false, error: DEAD_LINK };

    const subject = await resolveSubject(identity);
    if (!subject) return { success: false, error: DEAD_LINK };

    const eventSnap = await adminDb.collection("events").doc(identity.eventId).get();
    if (!eventSnap.exists) return { success: false, error: DEAD_LINK };

    const event = eventSnap.data()!;
    if (event.orgId !== subject.orgId) return { success: false, error: DEAD_LINK };
    if (!isOnEngagement(event, subject)) return { success: false, error: DEAD_LINK };

    const [organizerSnap, orgSnap] = await Promise.all([
      adminDb.collection("users").doc(event.createdBy as string).get(),
      adminDb.collection("organizations").doc(event.orgId as string).get(),
    ]);

    const map = (
      subject.kind === "member" ? event.rsvp : event.guestRsvp
    ) as Record<string, RsvpStatus> | undefined;

    return {
      success: true,
      data: {
        eventId: eventSnap.id,
        title: event.title as string,
        description: (event.description as string) || null,
        startAt: (event.startAt as FirebaseFirestore.Timestamp).toDate().toISOString(),
        endAt: (event.endAt as FirebaseFirestore.Timestamp).toDate().toISOString(),
        allDay: Boolean(event.allDay),
        timeZone: (event.timeZone as string) || "UTC",
        location: (event.location as string) || null,
        meetingUrl: (event.meetingUrl as string) || null,
        callProvider: effectiveCallProvider({
          callProvider: event.callProvider,
          meetingUrl: event.meetingUrl,
        }),
        organizerName: organizerSnap.exists
          ? (organizerSnap.data()!.name as string) || "The organizer"
          : "The organizer",
        orgName: orgSnap.exists ? ((orgSnap.data()!.name as string) ?? null) : null,
        subjectName: subject.name,
        subjectKind: subject.kind,
        current: map?.[subject.id] ?? "pending",
        cancelled: event.status === "cancelled",
      },
    };
  } catch (err: any) {
    console.error("[Rsvp] Failed to resolve context:", err);
    return { success: false, error: "Could not load this invitation." };
  }
}

/** Records the answer. Idempotent — clicking "Yes" twice is still yes. */
export async function submitTokenRsvpAction(
  token: string,
  status: RsvpStatus
): Promise<SubmitResult> {
  try {
    if (!RSVP_VALUES.includes(status)) {
      return { success: false, error: "That is not a valid response." };
    }

    let identity: RsvpIdentity | null;
    try {
      identity = verifyRsvpToken(token);
    } catch (err) {
      console.error("[Rsvp] Token verification unavailable:", err);
      return { success: false, error: "RSVP is not configured on this deployment." };
    }
    if (!identity) return { success: false, error: DEAD_LINK };

    const subject = await resolveSubject(identity);
    if (!subject) return { success: false, error: DEAD_LINK };

    const ref = adminDb.collection("events").doc(identity.eventId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: DEAD_LINK };

    const event = snap.data()!;
    if (event.orgId !== subject.orgId) return { success: false, error: DEAD_LINK };
    if (!isOnEngagement(event, subject)) return { success: false, error: DEAD_LINK };

    // Gate 4. Unlike the others this one is safe to explain: the person
    // holds a valid link, so the state is already theirs to know.
    if (event.status === "cancelled") {
      return { success: false, error: "This engagement was cancelled." };
    }

    const field = subject.kind === "member" ? "rsvp" : "guestRsvp";

    await ref.update({
      // Dotted path so concurrent RSVPs do not overwrite each other.
      [`${field}.${subject.id}`]: status,
      updatedAt: AdminTimestamp.now(),
    });

    await logActivity({
      eventType: "RSVP_RECORDED",
      orgId: subject.orgId,
      projectId: (event.projectId as string | null) ?? null,
      actor: { uid: subject.id, name: subject.name },
      metadata: {
        eventId: identity.eventId,
        eventTitle: event.title,
        rsvp: status,
        viaGuestLink: subject.kind === "guest",
      },
    });

    notifyOrganizerOfRsvp({
      organizerId: event.createdBy as string,
      event: {
        id: identity.eventId,
        title: event.title as string,
        projectId: (event.projectId as string | null) ?? null,
      },
      subjectId: subject.id,
      subjectName: subject.name,
      subjectKind: subject.kind,
      status,
    });

    return { success: true, status };
  } catch (err: any) {
    console.error("[Rsvp] Failed to record response:", err);
    return { success: false, error: "Could not record your response." };
  }
}

/* ------------------------------------------------------------------ */
/*  Joining the call                                                   */
/*                                                                     */
/*  An invited guest's way into an Orbit call. The signed link they    */
/*  already hold is the credential — the same four gates as an RSVP,   */
/*  then the call's own window check — rather than a second guest      */
/*  token system that would have to be revoked separately.             */
/*                                                                     */
/*  Guests only. A member holding their RSVP link is sent into the app */
/*  instead: their pass carries room-management rights, and a link     */
/*  that can be forwarded is the wrong thing to hand those out on.     */
/* ------------------------------------------------------------------ */

type GuestJoinResult =
  | { success: true; grant: CallGrant; title: string }
  | { success: false; error: string };

export async function joinScheduledCallAsGuestAction(
  input: unknown
): Promise<GuestJoinResult> {
  try {
    const parsed = guestJoinSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
    }
    const { token, fullName } = parsed.data;

    let identity: RsvpIdentity | null;
    try {
      identity = verifyRsvpToken(token);
    } catch (err) {
      console.error("[Rsvp] Token verification unavailable:", err);
      return { success: false, error: "Calling is not configured on this deployment." };
    }
    if (!identity) return { success: false, error: DEAD_LINK };
    if (identity.kind !== "guest") {
      return { success: false, error: "Open OrbitOS to join this call." };
    }

    const subject = await resolveSubject(identity);
    if (!subject) return { success: false, error: DEAD_LINK };

    const ref = adminDb.collection("events").doc(identity.eventId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: DEAD_LINK };

    const event = snap.data()!;
    if (event.orgId !== subject.orgId) return { success: false, error: DEAD_LINK };
    if (!isOnEngagement(event, subject)) return { success: false, error: DEAD_LINK };

    const now = Date.now();
    const decision = canJoinScheduledCall(
      {
        callProvider: effectiveCallProvider({
          callProvider: event.callProvider,
          meetingUrl: event.meetingUrl,
        }),
        roomId: (event.roomId as string) ?? null,
        cancelled: event.status === "cancelled",
        startAtMs: (event.startAt as FirebaseFirestore.Timestamp).toMillis(),
        endAtMs: (event.endAt as FirebaseFirestore.Timestamp).toMillis(),
        onTheList: true, // gate 3, above
      },
      now
    );
    if (!decision.allowed) return { success: false, error: decision.message };

    const limits = await resolveCallLimits(subject.orgId);
    if (limits.maxGuests === 0) {
      return {
        success: false,
        error: "This workspace's plan does not allow outside guests in calls.",
      };
    }

    /* The name they typed is the name the room sees, and it is kept: a
       guest correcting "Sarah Klien" is telling us something worth
       remembering for the next invitation. Only the engagement's copy
       is touched — the registry's record is the organizer's. */
    const name = sanitizeDisplayName(fullName);
    if (name && name !== event.guestNames?.[subject.id]) {
      await ref.update({ [`guestNames.${subject.id}`]: name });
    }

    const attendees = (event.attendees as string[]) ?? [];
    const guests = (event.guests as string[]) ?? [];

    const grant = await grantFor({
      roomId: event.roomId as string,
      identity: subject.id,
      displayName: name || subject.name,
      isMember: false,
      minutes: scheduledCallMinutes(
        (event.endAt as FirebaseFirestore.Timestamp).toMillis(),
        now
      ),
      maxParticipants: scheduledCallSeats(limits),
    });

    return { success: true, grant, title: (event.title as string) || "Engagement" };
  } catch (err: any) {
    console.error("[Rsvp] Guest join failed:", err);
    return { success: false, error: err?.message || "Could not join the call." };
  }
}
