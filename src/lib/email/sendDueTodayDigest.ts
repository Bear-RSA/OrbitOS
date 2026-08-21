import { Resend } from "resend";
import { format } from "date-fns";

import { emailShell, esc, row, styles, tailRow } from "@/lib/email/layout";
import { parseDateKey } from "@/lib/utils/dates";
import type { ReminderTask } from "@/lib/email/sendTaskReminder";

/* ------------------------------------------------------------------ */
/*  Due-today digest                                                   */
/*                                                                     */
/*  The 06:00 counterpart to the 09:00 due-tomorrow reminder: one mail */
/*  per person listing everything of theirs that falls due today, so   */
/*  the day starts with the list rather than with the dashboard.       */
/*                                                                     */
/*  Shares `ReminderTask` with the reminder deliberately. The two mails*/
/*  describe the same rows a day apart, and a second near-identical    */
/*  shape is how they would drift into disagreeing about what a task   */
/*  looks like.                                                        */
/* ------------------------------------------------------------------ */

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "OrbitOS <reminders@mail.orbit-os.co.za>";

export interface SendDueTodayDigestParams {
  recipient: { name: string; email: string };
  orgName: string;
  /** Already trimmed and ordered by the caller. */
  tasks: ReminderTask[];
  additionalCount?: number;
  dueDateKey: string;
  dashboardUrl: string;
}

type SendResult = { success: true; id?: string } | { success: false; error: string };

/**
 * Three shapes, matching the reminder's reasoning: an owner looking at work
 * nobody has picked up is reading a different message from a person looking
 * at their own queue.
 */
function heading(
  tasks: ReminderTask[],
  name: string,
  additionalCount: number
): string {
  const total = tasks.length + additionalCount;
  const orphans = tasks.filter((task) => task.unassigned).length;

  if (orphans === 0) {
    return `${esc(name)}, ${
      total === 1 ? "one task is" : `${total} tasks are`
    } due today.`;
  }

  if (orphans === total) {
    return `${esc(name)}, ${
      total === 1 ? "one unassigned task is" : `${total} unassigned tasks are`
    } due today.`;
  }

  return `${esc(name)}, ${total} tasks are due today — ${orphans} with nobody assigned.`;
}

function footerReason(
  tasks: ReminderTask[],
  orgName: string,
  additionalCount: number
): string {
  const total = tasks.length + additionalCount;
  const orphans = tasks.filter((task) => task.unassigned).length;
  const org = `<strong>${esc(orgName)}</strong>`;

  if (orphans === 0) {
    return `You're receiving this because ${
      total === 1 ? "this task is" : "these tasks are"
    } assigned to you in ${org} and ${total === 1 ? "it falls" : "they fall"} due today.`;
  }

  if (orphans === total) {
    return `You're receiving this as an owner of ${org} — ${
      total === 1
        ? "nobody is assigned to this task"
        : "nobody is assigned to these tasks"
    }, and today is the day.`;
  }

  return `You're receiving this because these tasks are due today in ${org}, plus
      ${orphans} nobody has picked up — those come to you as an owner.`;
}

function buildHtml(params: SendDueTodayDigestParams): string {
  const additionalCount = params.additionalCount ?? 0;
  const dayLabel = format(parseDateKey(params.dueDateKey), "EEEE d MMMM");

  const rows = params.tasks
    .map((task) =>
      row({
        title: task.title,
        url: task.url,
        meta: [
          task.unassigned
            ? `<span style="${styles.flag}">Unassigned</span>`
            : null,
          task.projectName ? esc(task.projectName) : null,
          task.status === "doing" ? "In progress" : "Not started",
          task.isBlocked ? "&#9940; Blocked" : null,
        ].filter((part): part is string => Boolean(part)),
      })
    )
    .join("");

  return emailShell({
    preheader: `${params.tasks.length + additionalCount} due today in ${params.orgName}`,
    eyebrow: `Due today — ${dayLabel}`,
    headingHtml: heading(params.tasks, params.recipient.name, additionalCount),
    sections: [
      { rowsHtml: rows + tailRow(additionalCount, "more due today") },
    ],
    ctaLabel: "Open OrbitOS →",
    ctaUrl: params.dashboardUrl,
    footerHtml: `${footerReason(
      params.tasks,
      params.orgName,
      additionalCount
    )} Turn the due-today digest off under Settings → Notifications.`,
  });
}

export async function sendDueTodayDigest(
  params: SendDueTodayDigestParams
): Promise<SendResult> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("[DueToday]: RESEND_API_KEY not configured. Email will not be sent.");
      return { success: false, error: "Missing API key" };
    }

    if (params.tasks.length === 0) {
      return { success: false, error: "No tasks to list" };
    }

    const total = params.tasks.length + (params.additionalCount ?? 0);
    const orphans = params.tasks.filter((task) => task.unassigned).length;

    const subject =
      total === 1
        ? `Due today${orphans === 1 ? " (unassigned)" : ""}: ${params.tasks[0].title}`
        : `Due today: ${total} tasks${orphans > 0 ? ` (${orphans} unassigned)` : ""}`;

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [params.recipient.email],
      subject,
      html: buildHtml(params),
    });

    if (error) {
      console.error("[DueToday Failure]:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("[DueToday Error]:", err);
    return { success: false, error: err.message || "Internal error during digest dispatch" };
  }
}
