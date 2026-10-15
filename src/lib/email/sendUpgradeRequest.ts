import { Resend } from "resend";

/* ------------------------------------------------------------------ */
/*  Upgrade request notification                                       */
/*                                                                     */
/*  While checkout is paused (see lib/billing/checkout), a workspace   */
/*  owner asking for a paid plan is a sales lead. This tells sales     */
/*  who asked, for which plan, and which org to move. Reply-To is the  */
/*  owner, so answering the email reaches them directly.               */
/* ------------------------------------------------------------------ */

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "OrbitOS <billing@mail.orbit-os.co.za>";

export interface UpgradeRequestParams {
  to: string;
  orgId: string;
  orgName: string;
  currentPlan: string;
  requestedPlan: string;
  owner: { name: string; email: string };
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

function lines(p: UpgradeRequestParams): [string, string][] {
  return [
    ["Workspace", p.orgName || "(no name)"],
    ["Org ID", p.orgId],
    ["Current plan", p.currentPlan],
    ["Requested plan", p.requestedPlan],
    ["Owner", p.owner.name || "(no name)"],
    ["Owner email", p.owner.email || "(none on file)"],
  ];
}

export async function sendUpgradeRequest(params: UpgradeRequestParams): Promise<SendResult> {
  const subject = `Upgrade request: ${params.orgName || params.orgId} wants ${params.requestedPlan}`;
  const rows = lines(params);
  const command = `node scripts/backfill-subscriptions.js --apply --tier=<tier id> --only=${params.orgId}`;

  const text = [
    subject,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "To move them across once agreed:",
    command,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #050505; color: #ededed; margin: 0; padding: 0;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 24px;">
    <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 24px;">${esc(subject)}</h1>
    <table style="font-size: 14px; border-collapse: collapse;">
      ${rows
        .map(
          ([k, v]) =>
            `<tr><td style="color: #888; padding: 4px 16px 4px 0;">${esc(k)}</td><td style="padding: 4px 0;">${esc(v)}</td></tr>`
        )
        .join("")}
    </table>
    <p style="font-size: 13px; color: #888; margin: 28px 0 6px;">To move them across once agreed:</p>
    <code style="font-size: 12px; color: #ededed;">${esc(command)}</code>
  </div>
</body>
</html>`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: params.to,
      ...(params.owner.email && { reply_to: params.owner.email }),
      subject,
      text,
      html,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
