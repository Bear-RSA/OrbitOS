import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";

import { recordDeliveryEvent, type DeliveryEventType } from "@/lib/tasks/mail-deliveries";

/* ------------------------------------------------------------------ */
/*  Resend delivery webhook                                            */
/*                                                                     */
/*  POST /api/webhooks/resend                                          */
/*                                                                     */
/*  `sendEngagementInvite`'s Resend call only confirms the API          */
/*  accepted a mail — it says nothing about whether the message ever   */
/*  reached an inbox. This is the other half: Resend calls back here    */
/*  when a message is delivered, bounces, is marked spam, or is         */
/*  delayed, which is the only way "sent" and "arrived" stop being the  */
/*  same claim for a guest who has no OrbitOS account to check.         */
/*                                                                     */
/*  Signed with Svix — verified before anything in the body is trusted, */
/*  since this is a public URL and the payload names real recipients'   */
/*  addresses. Register this route's URL in the Resend dashboard's      */
/*  Webhooks tab and put the signing secret it gives you in             */
/*  RESEND_WEBHOOK_SECRET.                                              */
/* ------------------------------------------------------------------ */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EVENT_TYPES: Record<string, DeliveryEventType> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.delivery_delayed": "delayed",
};

interface ResendTag {
  name?: string;
  value?: string;
}

interface ResendWebhookData {
  email_id?: string;
  to?: string | string[];
  tags?: ResendTag[];
  bounce?: { message?: string; type?: string };
  complaint?: { type?: string };
}

interface ResendWebhookEvent {
  type?: string;
  created_at?: string;
  data?: ResendWebhookData;
}

function tagValue(tags: ResendTag[] | undefined, name: string): string | null {
  if (!Array.isArray(tags)) return null;
  return tags.find((t) => t?.name === name)?.value ?? null;
}

/** Resend's own account of what went wrong, when it has one. */
function reasonFrom(data: ResendWebhookData): string | null {
  return data.bounce?.message ?? data.bounce?.type ?? data.complaint?.type ?? null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[Resend Webhook] RESEND_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const body = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: ResendWebhookEvent;
  try {
    event = new Webhook(secret).verify(body, headers) as ResendWebhookEvent;
  } catch (err) {
    console.error("[Resend Webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const kind = event.type ? EVENT_TYPES[event.type] : undefined;
  if (!kind) {
    // Not one this app tracks (e.g. email.sent, email.opened, email.clicked).
    return NextResponse.json({ ok: true });
  }

  const data = event.data ?? {};
  const messageId = data.email_id;
  const recipientEmail = Array.isArray(data.to) ? data.to[0] : data.to;

  if (!messageId || !recipientEmail) {
    console.error("[Resend Webhook] Payload missing id/recipient:", event);
    return NextResponse.json({ ok: true });
  }

  await recordDeliveryEvent({
    messageId,
    type: kind,
    recipientEmail,
    engagementId: tagValue(data.tags, "engagement_id"),
    reason: reasonFrom(data),
    occurredAt: (event.created_at as string) ?? new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
