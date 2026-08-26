import { adminDb } from "@/lib/firebase/admin";
import { resolvePreferences } from "@/types/preferences";
import { sendRsvpNotification } from "@/lib/email/sendRsvpNotification";
import type { RsvpStatus } from "@/types/event";

/* ------------------------------------------------------------------ */
/*  Organizer notification                                             */
/*                                                                     */
/*  Shared by both RSVP paths — the token link a guest answers from    */
/*  and the in-app action a member uses — so the lookup, the           */
/*  preference gate, and the "never let this affect the RSVP" fire-    */
/*  and-forget shape live in exactly one place.                        */
/* ------------------------------------------------------------------ */

export interface NotifyOrganizerParams {
  organizerId: string;
  event: { id: string; title: string; projectId: string | null };
  subjectId: string;
  subjectName: string;
  subjectKind: "member" | "guest";
  status: RsvpStatus;
}

/**
 * Fire-and-forget: the caller does not await this. A slow or failed send
 * must never delay or fail the RSVP the person is actually waiting on.
 */
export function notifyOrganizerOfRsvp(params: NotifyOrganizerParams): void {
  const { organizerId, subjectId } = params;
  // The organizer never appears in the RSVP roll today, but a self-notify
  // guard is cheap insurance against that changing later.
  if (subjectId === organizerId) return;

  adminDb
    .collection("users")
    .doc(organizerId)
    .get()
    .then((snap) => {
      if (!snap.exists) return;
      const data = snap.data()!;

      const email = data.email as string | undefined;
      if (!email) return;
      if (!resolvePreferences(data.preferences).rsvpNotifications) return;

      return sendRsvpNotification({
        event: params.event,
        organizer: { name: (data.name as string) || "Operative", email },
        subjectName: params.subjectName,
        subjectKind: params.subjectKind,
        status: params.status,
      });
    })
    .catch((err) => console.error("[Rsvp] Organizer notification failed:", err));
}
