import { Resend } from "resend";
import { format } from "date-fns";

import { parseDateKey } from "@/lib/utils/dates";

/* ------------------------------------------------------------------ */
/*  Due-soon task reminders                                            */
/*                                                                     */
/*  One mail per person, not one per task. Somebody with six things    */
/*  landing tomorrow needs a list they can act on, and six separate    */
/*  mails is both worse to read and six times the Resend invoice.      */
/*                                                                     */
/*  The day is rendered from `dueDateKey` through `parseDateKey`, not  */
/*  from the stored Timestamp: a due date is a calendar day, and       */
/*  formatting the instant on a server in another zone is exactly how  */
/*  a reminder ends up naming the wrong day.                           */
/* ------------------------------------------------------------------ */

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "OrbitOS <reminders@mail.orbit-os.co.za>";

export interface ReminderTask {
  id: string;
  title: string;
  projectName: string | null;
  /** "YYYY-MM-DD" — the day this is due. */
  dueDateKey: string;
  status: "todo" | "doing";
  isBlocked: boolean;
  /**
   * Nobody is assigned, so this reached the recipient as workspace owner
   * rather than as the person doing it. Called out in the row and in the
   * footer — an owner needs to see which of these are theirs to hand out.
   */
  unassigned: boolean;
  /** Deep link into the task's project. */
  url: string;
}

export interface SendTaskReminderParams {
  recipient: { name: string; email: string };
  orgName: string;
  /** The tasks to list, already trimmed and ordered by the caller. */
  tasks: ReminderTask[];
  /** Tasks due that day beyond the ones listed, summarised as a tail line. */
  additionalCount?: number;
  dueDateKey: string;
  dashboardUrl: string;
}

type SendResult = { success: true; id?: string } | { success: false; error: string };

/** Blocks HTML injection from a title typed by a person. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The headline. Three shapes, because an owner looking at work nobody has
 * picked up is reading a different message from a person looking at their
 * own queue — and "5 tasks are due" over a list they are not doing reads
 * as an accusation.
 */
function heading(
  tasks: ReminderTask[],
  name: string,
  additionalCount: number
): string {
  // Counts the trimmed tail too, so the headline and the subject line agree.
  const total = tasks.length + additionalCount;
  const orphans = tasks.filter((task) => task.unassigned).length;

  if (orphans === 0) {
    return `${esc(name)}, ${total === 1 ? "one task is" : `${total} tasks are`} due in 24 hours.`;
  }

  if (orphans === total) {
    return `${esc(name)}, ${
      total === 1 ? "one unassigned task is" : `${total} unassigned tasks are`
    } due in 24 hours.`;
  }

  return `${esc(name)}, ${total} tasks are due in 24 hours — ${orphans} with nobody assigned.`;
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
    } assigned to you in ${org}.`;
  }

  if (orphans === total) {
    return `You're receiving this as an owner of ${org} — ${
      total === 1 ? "nobody is assigned to this task" : "nobody is assigned to these tasks"
    }.`;
  }

  return `You're receiving this because these tasks are assigned to you in ${org}, plus
      ${orphans} nobody has picked up — those come to you as an owner.`;
}

function buildHtml(params: SendTaskReminderParams): string {
  const { recipient, orgName, tasks, dueDateKey, dashboardUrl } = params;
  const dayLabel = format(parseDateKey(dueDateKey), "EEEE d MMMM");
  const additionalCount = params.additionalCount ?? 0;

  const rows = tasks
    .map((task) => {
      const meta = [
        task.unassigned ? `<span class="flag">Unassigned</span>` : null,
        task.projectName ? esc(task.projectName) : null,
        task.status === "doing" ? "In progress" : "Not started",
        task.isBlocked ? "⛔ Blocked" : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return `
      <tr>
        <td class="task">
          <a class="title" href="${esc(task.url)}">${esc(task.title)}</a>
          <div class="meta">${meta}</div>
        </td>
      </tr>`;
    })
    .join("");

  // A trimmed list that says nothing about the trim hides work. Cheaper to
  // admit the tail than to let someone believe they saw everything.
  const tail =
    additionalCount > 0
      ? `<tr><td class="more">+ ${additionalCount} more due the same day — see the dashboard.</td></tr>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #050505; color: #ededed; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 0 auto; padding: 40px 24px; }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 6px; }
    .sub { font-size: 14px; color: #888; margin: 0 0 28px; }
    table { width: 100%; border-collapse: collapse; }
    .task { padding: 14px 0; border-bottom: 1px solid #1f2937; }
    .title { font-size: 15px; font-weight: 500; color: #ededed; text-decoration: none; }
    .meta { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .flag { color: #fbbf24; font-weight: 600; }
    .more { padding: 14px 0; font-size: 13px; color: #6b7280; }
    .cta { margin-top: 32px; }
    .cta a { display: inline-block; background: #ededed; color: #050505; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 8px; }
    .footer { margin-top: 40px; font-size: 12px; color: #4b5563; border-top: 1px solid #1f2937; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <p class="sub">Due tomorrow — ${esc(dayLabel)}</p>
    <h1>${heading(tasks, recipient.name, additionalCount)}</h1>
    <table>${rows}${tail}</table>
    <div class="cta">
      <a href="${esc(dashboardUrl)}">Open OrbitOS →</a>
    </div>
    <div class="footer">
      ${footerReason(tasks, orgName, additionalCount)} Turn reminders off under Settings → Notifications.<br>
      OrbitOS by Mirai Stack
    </div>
  </div>
</body>
</html>`;
}

export async function sendTaskReminder(
  params: SendTaskReminderParams
): Promise<SendResult> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("[Task Reminder]: RESEND_API_KEY not configured. Email will not be sent.");
      return { success: false, error: "Missing API key" };
    }

    if (params.tasks.length === 0) {
      return { success: false, error: "No tasks to remind about" };
    }

    // Unassigned work is counted off the listed tasks. The caller sorts
    // those first, so the only way to undercount is 25+ orphans in one org
    // — a workspace with bigger problems than a subject line.
    const total = params.tasks.length + (params.additionalCount ?? 0);
    const orphans = params.tasks.filter((task) => task.unassigned).length;

    const subject =
      total === 1
        ? `Due tomorrow${orphans === 1 ? " (unassigned)" : ""}: ${params.tasks[0].title}`
        : `Due tomorrow: ${total} tasks${orphans > 0 ? ` (${orphans} unassigned)` : ""}`;

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [params.recipient.email],
      subject,
      html: buildHtml(params),
    });

    if (error) {
      console.error("[Task Reminder Failure]:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("[Task Reminder Error]:", err);
    return { success: false, error: err.message || "Internal error during reminder dispatch" };
  }
}
