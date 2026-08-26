import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

/* ------------------------------------------------------------------ */
/*  Delivery events                                                     */
/*                                                                     */
/*  Resend's send response only confirms the API accepted the mail —   */
/*  it says nothing about whether the message ever reached an inbox.   */
/*  A guest invite can report `success` from `sendEngagementInvite`     */
/*  and still bounce or land in spam minutes later; nothing in this     */
/*  codebase used to hear about that second half at all.                */
/*                                                                     */
/*  This is where the Resend webhook (`/api/webhooks/resend`) writes    */
/*  what actually happened, keyed by Resend's own message id so a       */
/*  retried webhook delivery overwrites rather than duplicates.         */
/* ------------------------------------------------------------------ */

export type DeliveryEventType = "delivered" | "bounced" | "complained" | "delayed";

export interface DeliveryEvent {
  messageId: string;
  type: DeliveryEventType;
  recipientEmail: string;
  /** Which engagement this send belonged to, from the `engagement_id` tag. */
  engagementId: string | null;
  /** The provider's own account of what went wrong, verbatim. */
  reason: string | null;
  /** ISO 8601, from the webhook payload. */
  occurredAt: string;
}

/**
 * Records one delivery-status event.
 *
 * Never throws: Resend retries a webhook that does not 200, and a retry
 * storm over a bookkeeping failure is worse than one missed record. The
 * event mattering enough to chase is what `readRecentDeliveryFailures`
 * and the dashboard banner are for, not this call succeeding.
 */
export async function recordDeliveryEvent(event: DeliveryEvent): Promise<void> {
  try {
    await adminDb
      .collection("mail_deliveries")
      .doc(event.messageId)
      .set(
        {
          messageId: event.messageId,
          type: event.type,
          recipientEmail: event.recipientEmail,
          engagementId: event.engagementId,
          reason: event.reason,
          occurredAt: Timestamp.fromDate(new Date(event.occurredAt)),
        },
        { merge: true }
      );
  } catch (err) {
    console.error(`[MailDeliveries] Could not record ${event.messageId}:`, err);
  }
}

/** How far back the dashboard looks. Older failures are the log's job. */
const LOOKBACK_DAYS = 3;

export interface DeliveryFailure {
  messageId: string;
  type: "bounced" | "complained";
  recipientEmail: string;
  engagementId: string | null;
  reason: string | null;
  occurredAt: string;
}

/**
 * Recent bounces and complaints for engagement invites.
 *
 * `delivered` and `delayed` are excluded on purpose — a delayed send often
 * still lands, and surfacing it as a failure would train an owner to
 * ignore the banner on an ordinary slow day.
 */
export async function readRecentDeliveryFailures(options?: {
  now?: Date;
  days?: number;
}): Promise<DeliveryFailure[]> {
  const now = options?.now ?? new Date();
  const days = options?.days ?? LOOKBACK_DAYS;
  const cutoff = Timestamp.fromDate(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));

  try {
    const snap = await adminDb
      .collection("mail_deliveries")
      .where("occurredAt", ">=", cutoff)
      .get();

    return snap.docs
      .map((doc) => doc.data())
      .filter((data) => data.type === "bounced" || data.type === "complained")
      .map((data) => ({
        messageId: data.messageId as string,
        type: data.type as "bounced" | "complained",
        recipientEmail: data.recipientEmail as string,
        engagementId: (data.engagementId as string | null) ?? null,
        reason: (data.reason as string | null) ?? null,
        occurredAt:
          data.occurredAt instanceof Timestamp
            ? data.occurredAt.toDate().toISOString()
            : new Date(0).toISOString(),
      }))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  } catch (err) {
    console.error("[MailDeliveries] Could not read recent failures:", err);
    return [];
  }
}
