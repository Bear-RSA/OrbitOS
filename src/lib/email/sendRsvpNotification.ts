import { Resend } from "resend";
import { getAppUrl } from "@/lib/utils/getAppUrl";
import type { RsvpStatus } from "@/types/event";

/* ------------------------------------------------------------------ */
/*  RSVP notifications                                                 */
/*                                                                     */
/*  The other half of the loop `sendEngagementInvite` starts: once a   */
/*  guest or member answers, the organizer is the one person who has   */
/*  no other way to find out short of reopening the engagement. This   */
/*  is a single-recipient send — no ICS, no fan-out — fired inline     */
/*  from the RSVP actions and never allowed to affect their result.    */
/* ------------------------------------------------------------------ */

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "OrbitOS <engagements@mail.orbit-os.co.za>";

export interface RsvpNotificationParams {
  event: { id: string; title: string; projectId: string | null };
  organizer: { name: string; email: string };
  subjectName: string;
  subjectKind: "member" | "guest";
  status: RsvpStatus;
}

type SendResult = { success: true; id?: string } | { success: false; error: string };

const HEADLINE: Record<RsvpStatus, (name: string) => string> = {
  accepted: (name) => `${name} accepted your invitation`,
  declined: (name) => `${name} declined your invitation`,
  tentative: (name) => `${name} tentatively accepted your invitation`,
  pending: (name) => `${name} responded to your invitation`,
};

/** Blocks HTML injection from a title or a name typed by a person. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Where "view the engagement" points — a project page, or the dashboard for one with none. */
function engagementUrl(projectId: string | null): string {
  const appUrl = getAppUrl();
  return projectId ? `${appUrl}/projects/${projectId}` : `${appUrl}/dashboard`;
}

function buildText(params: RsvpNotificationParams): string {
  const { event, subjectName, subjectKind, status } = params;

  const lines = [
    HEADLINE[status](subjectName),
    "",
    event.title,
    "",
    `${subjectName}${subjectKind === "guest" ? " (guest)" : ""} — ${status}`,
    "",
    `View the engagement: ${engagementUrl(event.projectId)}`,
  ];

  return lines.join("\n");
}

function buildHtml(params: RsvpNotificationParams): string {
  const { event, subjectName, subjectKind, status } = params;
  const headline = HEADLINE[status](subjectName);
  const url = engagementUrl(event.projectId);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #050505; color: #ededed; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 0 auto; padding: 40px 24px; }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 6px; }
    .sub { font-size: 14px; color: #888; margin: 0 0 28px; }
    .who { font-size: 15px; color: #d1d5db; margin: 0 0 28px; }
    .btn { display: inline-block; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 22px; border-radius: 8px; background: #ededed; color: #050505; }
    .footer { margin-top: 40px; font-size: 12px; color: #4b5563; border-top: 1px solid #1f2937; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <p class="sub">${esc(headline)}</p>
    <h1>${esc(event.title)}</h1>
    <p class="who">${esc(subjectName)}${subjectKind === "guest" ? " <span style=\"color:#6b7280\">(guest)</span>" : ""} — ${esc(status)}</p>
    <a class="btn" href="${esc(url)}">View the engagement</a>
    <div class="footer">Sent by OrbitOS.</div>
  </div>
</body>
</html>`;
}

/** Sends one organizer notification. Never throws — callers fire this without awaiting. */
export async function sendRsvpNotification(params: RsvpNotificationParams): Promise<SendResult> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("[Rsvp Notification]: RESEND_API_KEY not configured. Email will not be sent.");
      return { success: false, error: "Missing API key" };
    }

    const { event, organizer, subjectName, status } = params;

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [organizer.email],
      subject: `${HEADLINE[status](subjectName)} — ${event.title}`,
      html: buildHtml(params),
      text: buildText(params),
      // Read back by the delivery webhook to attribute a bounce/complaint
      // to the engagement that caused it.
      tags: [
        { name: "event_id", value: event.id },
        { name: "recipient_kind", value: "organizer" },
      ],
    });

    if (error) {
      console.error("[Rsvp Notification Failure]:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("[Rsvp Notification Error]:", err);
    return { success: false, error: err.message || "Internal error during RSVP notification" };
  }
}
