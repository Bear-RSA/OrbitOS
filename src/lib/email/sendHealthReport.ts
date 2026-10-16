import { Resend } from "resend";
import { format } from "date-fns";

import { MAX_PROJECT_LINES, type HealthReport } from "@/lib/reports/health-report";

/* ------------------------------------------------------------------ */
/*  Monthly health report                                              */
/*                                                                     */
/*  One mail per owner on the 1st, about the month that just ended.    */
/*  Same look as the due-tomorrow reminder so the two read as one      */
/*  product. The numbers come pre-computed from `health-report`; this  */
/*  file only decides how to say them.                                 */
/* ------------------------------------------------------------------ */

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "OrbitOS <reports@mail.orbit-os.co.za>";

export interface SendHealthReportParams {
  recipient: { name: string; email: string };
  orgName: string;
  report: HealthReport;
  dashboardUrl: string;
  settingsUrl: string;
}

type SendResult = { success: true; id?: string } | { success: false; error: string };

/** Blocks HTML injection from a name typed by a person. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "September 2026" from "2026-09". */
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return format(new Date(y, m - 1, 1), "MMMM yyyy");
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The line under the headline comparing this month with the last. */
export function comparisonLine(report: HealthReport): string {
  const { completed, completedPrevious } = report;
  if (completedPrevious === 0) {
    return completed === 0 ? "Nothing was finished the month before either." : "Nothing was finished the month before.";
  }
  const change = Math.round(((completed - completedPrevious) / completedPrevious) * 100);
  if (change === 0) return `The same as the month before (${completedPrevious}).`;
  return change > 0
    ? `${change}% more than the month before (${completedPrevious}).`
    : `${Math.abs(change)}% fewer than the month before (${completedPrevious}).`;
}

/** On-time share of work due in the month, or null when nothing was due. */
export function onTimePercent(report: HealthReport): number | null {
  if (report.dueInMonth === 0) return null;
  return Math.round((report.dueOnTime / report.dueInMonth) * 100);
}

export function subjectFor(orgName: string, report: HealthReport): string {
  return `${orgName} in ${monthLabel(report.monthKey)}: ${plural(report.completed, "task", "tasks")} done`;
}

function stat(value: string, label: string): string {
  return `<td class="stat"><div class="value">${value}</div><div class="label">${label}</div></td>`;
}

function buildHtml(params: SendHealthReportParams): string {
  const { recipient, orgName, report, dashboardUrl, settingsUrl } = params;
  const onTime = onTimePercent(report);

  const stats = `
    <table class="stats"><tr>
      ${stat(String(report.completed), "Done")}
      ${stat(onTime === null ? "–" : `${onTime}%`, "On time")}
      ${stat(String(report.openOverdue), "Overdue now")}
      ${stat(String(report.blockedNow), "Blocked now")}
    </tr></table>`;

  const projectRows = report.projects
    .slice(0, MAX_PROJECT_LINES)
    .map((line) => {
      const meta = [
        `${line.completed} done`,
        line.missed > 0 ? `<span class="flag">${line.missed} missed</span>` : null,
        `${line.score}% ${esc(line.verdict)}`,
      ]
        .filter(Boolean)
        .join(" · ");
      return `<tr><td class="row"><div class="title">${esc(line.name)}</div><div class="meta">${meta}</div></td></tr>`;
    })
    .join("");

  const moreProjects =
    report.projects.length > MAX_PROJECT_LINES
      ? `<tr><td class="more">+ ${report.projects.length - MAX_PROJECT_LINES} more on the dashboard.</td></tr>`
      : "";

  const contributors = report.topContributors
    .map(
      (person) =>
        `<tr><td class="row"><div class="title">${esc(person.name)}</div><div class="meta">${plural(person.completed, "task", "tasks")} done</div></td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #050505; color: #ededed; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 0 auto; padding: 40px 24px; }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 6px; }
    h2 { font-size: 13px; font-weight: 600; color: #888; margin: 32px 0 4px; text-transform: uppercase; letter-spacing: 0.08em; }
    .sub { font-size: 14px; color: #888; margin: 0 0 28px; }
    table { width: 100%; border-collapse: collapse; }
    .stats { margin-top: 24px; }
    .stat { padding: 14px 8px 14px 0; vertical-align: top; }
    .value { font-size: 24px; font-weight: 300; color: #ededed; }
    .label { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .row { padding: 12px 0; border-bottom: 1px solid #1f2937; }
    .title { font-size: 15px; font-weight: 500; color: #ededed; }
    .meta { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .flag { color: #fbbf24; font-weight: 600; }
    .more { padding: 12px 0; font-size: 13px; color: #6b7280; }
    .cta { margin-top: 32px; }
    .cta a { display: inline-block; background: #ededed; color: #050505; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 8px; }
    .footer { margin-top: 40px; font-size: 12px; color: #4b5563; border-top: 1px solid #1f2937; padding-top: 20px; }
    .footer a { color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <p class="sub">${esc(orgName)} · ${esc(monthLabel(report.monthKey))}</p>
    <h1>${esc(recipient.name)}, your studio finished ${plural(report.completed, "task", "tasks")} last month.</h1>
    <p class="sub">${esc(comparisonLine(report))}</p>
    ${stats}
    ${projectRows ? `<h2>Projects</h2><table>${projectRows}${moreProjects}</table>` : ""}
    ${contributors ? `<h2>Most work done</h2><table>${contributors}</table>` : ""}
    <div class="cta">
      <a href="${esc(dashboardUrl)}">Open OrbitOS →</a>
    </div>
    <div class="footer">
      You're receiving this as an owner of <strong>${esc(orgName)}</strong>.
      Turn it off under <a href="${esc(settingsUrl)}">Settings → Notifications</a>.<br>
      OrbitOS by Mirai Stack
    </div>
  </div>
</body>
</html>`;
}

export async function sendHealthReport(params: SendHealthReportParams): Promise<SendResult> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("[Health Report]: RESEND_API_KEY not configured. Email will not be sent.");
      return { success: false, error: "Missing API key" };
    }

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [params.recipient.email],
      subject: subjectFor(params.orgName, params.report),
      html: buildHtml(params),
    });

    if (error) {
      console.error("[Health Report Failure]:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("[Health Report Error]:", err);
    return { success: false, error: err.message || "Internal error during report dispatch" };
  }
}
