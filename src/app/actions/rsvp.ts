"use server";

import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { logActivity } from "@/lib/telemetry";
import { verifyRsvpToken, type RsvpIdentity } from "@/lib/calendar/rsvp-token";
import type { RsvpStatus } from "@/types/event";

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

    return { success: true, status };
  } catch (err: any) {
    console.error("[Rsvp] Failed to record response:", err);
    return { success: false, error: "Could not record your response." };
  }
}
