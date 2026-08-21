import { Resend } from "resend";
import { format } from "date-fns";

import { emailShell, esc, notice, row, tailRow } from "@/lib/email/layout";
import { parseDateKey } from "@/lib/utils/dates";

/* ------------------------------------------------------------------ */
/*  End-of-day debrief                                                 */
/*                                                                     */
/*  What one person did today, in four sections. Unlike the two due    */
/*  mails, this one is assembled from the activity log rather than     */
/*  from task documents: a task holds its current state and no         */
/*  history, so "moved to doing this afternoon" exists nowhere else.   */
/*                                                                     */
/*  Never sent to somebody with an empty day. A debrief that says      */
/*  "nothing happened" trains people to delete it unopened, and the    */
/*  ones that matter go with it.                                       */
/* ------------------------------------------------------------------ */

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "OrbitOS <debrief@mail.orbit-os.co.za>";

/** Rows beyond this in any one section become a "+ N more" line. */
const MAX_PER_SECTION = 12;

export interface DebriefEntry {
  taskId: string;
  title: string;
  projectName?: string | null;
  url?: string | null;
  /** The section-specific aside — a status move, or who handed it over. */
  detail?: string | null;
}

export interface DailyDebriefSections {
  created: DebriefEntry[];
  assigned: DebriefEntry[];
  moved: DebriefEntry[];
  completed: DebriefEntry[];
}

/**
 * Where this mail sits in a free workspace's trial.
 *
 * Absent on a paid tier, where the debrief is simply a feature the workspace
 * has. Present only while the allowance is finite, so nothing about billing
 * appears in a mail to somebody who is already paying.
 */
export interface DebriefTrial {
  /** Which mail of the allowance this is, 1-based. */
  number: number;
  /** The tier's lifetime allowance. */
  allowance: number;
  upgradeUrl: string;
}

export interface SendDailyDebriefParams {
  recipient: { name: string; email: string };
  orgName: string;
  /** "YYYY-MM-DD" — the SAST calendar day being reported on. */
  dayKey: string;
  sections: DailyDebriefSections;
  dashboardUrl: string;
  trial?: DebriefTrial;
}

type SendResult = { success: true; id?: string } | { success: false; error: string };

export function debriefTotal(sections: DailyDebriefSections): number {
  return (
    sections.created.length +
    sections.assigned.length +
    sections.moved.length +
    sections.completed.length
  );
}

/**
 * Leads with what was finished, because that is the part worth reading
 * first, and falls back to the raw count on a day with nothing completed.
 */
function heading(name: string, sections: DailyDebriefSections): string {
  const done = sections.completed.length;
  const total = debriefTotal(sections);

  if (done > 0) {
    return `${esc(name)}, you closed ${
      done === 1 ? "one task" : `${done} tasks`
    } today.`;
  }

  return `${esc(name)}, ${
    total === 1 ? "one thing moved" : `${total} things moved`
  } on your work today.`;
}

function sectionOf(label: string, entries: DebriefEntry[]) {
  if (entries.length === 0) return null;

  const shown = entries.slice(0, MAX_PER_SECTION);
  const rows = shown
    .map((entry) =>
      row({
        title: entry.title,
        url: entry.url,
        meta: [
          entry.projectName ? esc(entry.projectName) : null,
          entry.detail ? esc(entry.detail) : null,
        ].filter((part): part is string => Boolean(part)),
      })
    )
    .join("");

  return {
    label,
    rowsHtml: rows + tailRow(entries.length - shown.length, "more"),
  };
}

/**
 * The trial callout.
 *
 * Silent on the way in and explicit at the end. The first mails carry a
 * quiet count so the allowance is never a surprise, and the last one says
 * plainly that it is the last — a feature that simply stops arriving reads
 * as a bug, and the person it stops for is the one being asked to pay.
 */
function trialNotice(trial: DebriefTrial | undefined): string {
  if (!trial) return "";

  const remaining = trial.allowance - trial.number;

  if (remaining > 0) {
    return notice({
      title: `Debrief ${trial.number} of ${trial.allowance}`,
      bodyHtml:
        `The end-of-day debrief is part of the paid plans. ` +
        `You have ${remaining === 1 ? "one more" : `${remaining} more`} on the free tier.`,
      linkLabel: "See plans",
      linkUrl: trial.upgradeUrl,
    });
  }

  return notice({
    title: "This was your last free debrief",
    bodyHtml:
      `That is ${trial.allowance} of ${trial.allowance} on the free tier. ` +
      `Upgrade to keep receiving it — everything else in your workspace ` +
      `carries on exactly as it is.`,
    linkLabel: "Upgrade to keep debriefs",
    linkUrl: trial.upgradeUrl,
  });
}

function buildHtml(params: SendDailyDebriefParams): string {
  const { sections } = params;
  const dayLabel = format(parseDateKey(params.dayKey), "EEEE d MMMM");

  const built = [
    sectionOf("Created", sections.created),
    sectionOf("Assigned to you", sections.assigned),
    sectionOf("Moved", sections.moved),
    sectionOf("Completed", sections.completed),
  ].filter((section): section is { label: string; rowsHtml: string } =>
    Boolean(section)
  );

  return emailShell({
    preheader: `${debriefTotal(sections)} updates on your work in ${params.orgName}`,
    eyebrow: `End of day — ${dayLabel}`,
    headingHtml: heading(params.recipient.name, sections),
    sections: built,
    noticeHtml: trialNotice(params.trial),
    ctaLabel: "Open OrbitOS →",
    ctaUrl: params.dashboardUrl,
    footerHtml:
      `You're receiving this because you were active in ` +
      `<strong>${esc(params.orgName)}</strong> today. ` +
      `Turn the debrief off under Settings → Notifications.`,
  });
}

export async function sendDailyDebrief(
  params: SendDailyDebriefParams
): Promise<SendResult> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("[Debrief]: RESEND_API_KEY not configured. Email will not be sent.");
      return { success: false, error: "Missing API key" };
    }

    const total = debriefTotal(params.sections);

    // Belt and braces — the caller filters empty days out before it gets
    // here, and an empty debrief must not escape if that ever regresses.
    if (total === 0) {
      return { success: false, error: "No activity to report" };
    }

    const done = params.sections.completed.length;
    const subject =
      done > 0
        ? `Your day: ${done} completed, ${total} update${total === 1 ? "" : "s"}`
        : `Your day: ${total} update${total === 1 ? "" : "s"}`;

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [params.recipient.email],
      subject,
      html: buildHtml(params),
    });

    if (error) {
      console.error("[Debrief Failure]:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("[Debrief Error]:", err);
    return { success: false, error: err.message || "Internal error during debrief dispatch" };
  }
}
