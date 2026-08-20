import { Resend } from "resend";
import { format } from "date-fns";
import { buildCalendar, type IcsAttendee, type IcsMethod } from "@/lib/calendar/ics";

/* ------------------------------------------------------------------ */
/*  Engagement invitations                                             */
/*                                                                     */
/*  This is the whole reason an engagement reaches somebody's real     */
/*  calendar. The subscription feed is a pull — it only helps people   */
/*  who already went and subscribed, and it cannot reach anyone        */
/*  outside the workspace at all. An email carrying a METHOD:REQUEST   */
/*  attachment is the push, and it is the one mechanism Google,        */
/*  Outlook, and Apple all honour without an OAuth handshake.          */
/*                                                                     */
/*  Two details do the heavy lifting, and both are easy to lose:       */
/*                                                                     */
/*    The attachment is served as text/calendar with the method in     */
/*    the content type. Sent as a bare application/octet-stream, the   */
/*    same bytes arrive as a file to download rather than as an        */
/*    invitation to accept.                                            */
/*                                                                     */
/*    Every recipient gets the SAME uid and sequence but their OWN     */
/*    RSVP link. The uid is what lets a client recognise a reschedule  */
/*    as the same meeting; the link is what lets a guest with no       */
/*    account answer.                                                  */
/* ------------------------------------------------------------------ */

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "OrbitOS <engagements@mail.orbit-os.co.za>";

export type InviteKind = "invite" | "update" | "cancel";

export interface EngagementForInvite {
  id: string;
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  startDateKey: string;
  timeZone: string;
  location?: string | null;
  meetingUrl?: string | null;
  sequence: number;
}

export interface InviteRecipient {
  email: string;
  name: string;
  /** Guests get a signed link; members answer inside OrbitOS. */
  rsvpUrl: string;
  kind: "member" | "guest";
}

export interface SendInviteParams {
  kind: InviteKind;
  engagement: EngagementForInvite;
  organizer: { name: string; email: string };
  recipient: InviteRecipient;
  /** Everyone on the invite, so clients can show the full attendee list. */
  attendeeList: IcsAttendee[];
  orgName?: string;
}

type SendResult = { success: true; id?: string } | { success: false; error: string };

/** Adds days to a "YYYY-MM-DD" key without going through a timezone. */
function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The human-readable "when". Rendered in the engagement's own zone rather
 * than the server's, because a recipient reading "09:00" wants the time
 * the organizer meant, not the time a lambda in Virginia thinks it is.
 */
function whenLine(engagement: EngagementForInvite): string {
  if (engagement.allDay) {
    const [y, m, d] = engagement.startDateKey.split("-").map(Number);
    return `${format(new Date(y, m - 1, d), "EEEE d MMMM yyyy")} — all day`;
  }

  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: engagement.timeZone,
  }).format(engagement.startAt);

  const clock = (date: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: engagement.timeZone,
    }).format(date);

  return `${day}, ${clock(engagement.startAt)}–${clock(engagement.endAt)} (${engagement.timeZone})`;
}

/** Blocks HTML injection from a title or a name typed by a person. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SUBJECT_PREFIX: Record<InviteKind, string> = {
  invite: "Invitation",
  update: "Updated",
  cancel: "Cancelled",
};

const METHOD_FOR: Record<InviteKind, IcsMethod> = {
  invite: "REQUEST",
  update: "REQUEST",
  cancel: "CANCEL",
};

function buildIcs(params: SendInviteParams): string {
  const { engagement, organizer, attendeeList, kind } = params;

  return buildCalendar({
    name: "OrbitOS",
    method: METHOD_FOR[kind],
    entries: [
      {
        /* Stable across every resend — this is what makes a reschedule
           land on the existing entry instead of creating a second one. */
        uid: `event-${engagement.id}@orbitos`,
        summary: engagement.title,
        description: engagement.description || null,
        location: engagement.location || null,
        url: engagement.meetingUrl || null,
        sequence: engagement.sequence,
        organizer,
        attendees: attendeeList,
        status: kind === "cancel" ? "CANCELLED" : "CONFIRMED",
        categories: ["Engagement"],
        lastModified: new Date(),
        timing: engagement.allDay
          ? {
              allDay: true,
              startDate: engagement.startDateKey,
              endDate: shiftDateKey(engagement.startDateKey, 1),
            }
          : { allDay: false, start: engagement.startAt, end: engagement.endAt },
      },
    ],
  });
}

function buildHtml(params: SendInviteParams): string {
  const { engagement, organizer, recipient, kind, orgName } = params;

  const heading =
    kind === "cancel"
      ? "This engagement has been cancelled"
      : kind === "update"
        ? "An engagement has been updated"
        : `${esc(organizer.name)} invited you to an engagement`;

  const rows: string[] = [`<tr><td class="k">When</td><td class="v">${esc(whenLine(engagement))}</td></tr>`];

  if (engagement.location) {
    rows.push(`<tr><td class="k">Where</td><td class="v">${esc(engagement.location)}</td></tr>`);
  }
  if (engagement.meetingUrl && kind !== "cancel") {
    rows.push(
      `<tr><td class="k">Link</td><td class="v"><a href="${esc(engagement.meetingUrl)}">${esc(engagement.meetingUrl)}</a></td></tr>`
    );
  }
  rows.push(`<tr><td class="k">Organizer</td><td class="v">${esc(organizer.name)}</td></tr>`);

  /* The RSVP block is suppressed on a cancellation — there is nothing
     left to answer, and offering the buttons anyway reads as a bug. */
  const rsvp =
    kind === "cancel"
      ? ""
      : `
      <div class="rsvp">
        <p class="ask">Can you make it?</p>
        <a class="btn yes" href="${esc(recipient.rsvpUrl)}?reply=accepted">Yes</a>
        <a class="btn maybe" href="${esc(recipient.rsvpUrl)}?reply=tentative">Maybe</a>
        <a class="btn no" href="${esc(recipient.rsvpUrl)}?reply=declined">No</a>
      </div>`;

  const guestNote =
    recipient.kind === "guest" && kind !== "cancel"
      ? `<p class="note">You are joining as a guest — no account needed. The attached
           invitation will add this to your calendar.</p>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #050505; color: #ededed; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 0 auto; padding: 40px 24px; }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 6px; ${kind === "cancel" ? "text-decoration: line-through; color: #9ca3af;" : ""} }
    .sub { font-size: 14px; color: #888; margin: 0 0 28px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .k { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; padding: 8px 16px 8px 0; vertical-align: top; white-space: nowrap; }
    .v { font-size: 15px; color: #d1d5db; padding: 8px 0; }
    .v a { color: #93c5fd; }
    .desc { font-size: 14px; color: #9ca3af; border-left: 2px solid #1f2937; padding-left: 14px; margin: 20px 0; white-space: pre-wrap; }
    .rsvp { margin: 32px 0 8px; }
    .ask { font-size: 13px; color: #6b7280; margin: 0 0 12px; }
    .btn { display: inline-block; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 22px; border-radius: 8px; margin-right: 8px; }
    .yes { background: #ededed; color: #050505; }
    .maybe { background: #1f2937; color: #ededed; }
    .no { background: #1f2937; color: #ededed; }
    .note { font-size: 13px; color: #6b7280; margin-top: 24px; }
    .footer { margin-top: 40px; font-size: 12px; color: #4b5563; border-top: 1px solid #1f2937; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <p class="sub">${esc(heading)}</p>
    <h1>${esc(engagement.title)}</h1>
    <table>${rows.join("")}</table>
    ${engagement.description ? `<div class="desc">${esc(engagement.description)}</div>` : ""}
    ${rsvp}
    ${guestNote}
    <div class="footer">
      Sent by ${esc(orgName || "OrbitOS")} via OrbitOS.
      ${kind === "cancel" ? "This entry has been removed from your calendar." : "The attached .ics adds this to your calendar."}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Sends one invitation. Deliberately per-recipient rather than a single
 * message with everyone in `to`: each guest needs their own RSVP link,
 * and a shared thread would leak the whole invitee list to an outside
 * party who has no business seeing it.
 */
export async function sendEngagementInvite(params: SendInviteParams): Promise<SendResult> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("[Engagement Invite]: RESEND_API_KEY not configured. Email will not be sent.");
      return { success: false, error: "Missing API key" };
    }

    const { kind, engagement, organizer, recipient } = params;
    const method = METHOD_FOR[kind];
    const ics = buildIcs(params);

    const dayLabel = engagement.allDay
      ? format(new Date(engagement.startDateKey + "T00:00:00"), "d MMM yyyy")
      : new Intl.DateTimeFormat("en-GB", {
          day: "numeric",
          month: "short",
          timeZone: engagement.timeZone,
        }).format(engagement.startAt);

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [recipient.email],
      // Replies should reach a person, not a no-reply void.
      reply_to: organizer.email,
      subject: `${SUBJECT_PREFIX[kind]}: ${engagement.title} — ${dayLabel}`,
      html: buildHtml(params),
      attachments: [
        {
          filename: "invite.ics",
          content: Buffer.from(ics, "utf8").toString("base64"),
          /* The method has to travel on the content type. Without it the
             attachment is just a file, and the client renders no RSVP. */
          content_type: `text/calendar; charset=utf-8; method=${method}`,
        },
      ],
    });

    if (error) {
      console.error("[Engagement Invite Failure]:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("[Engagement Invite Error]:", err);
    return { success: false, error: err.message || "Internal error during invite dispatch" };
  }
}
