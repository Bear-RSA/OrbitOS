import { Resend } from "resend";
import { format } from "date-fns";

const resend = new Resend(process.env.RESEND_API_KEY);

interface DigestData {
  ownerName: string;
  ownerEmail: string;
  orgName: string;
  overdueCount: number;
  inactiveCount: number;
  atRiskProjectName: string | null;
  atRiskStatus: "watch" | "at-risk" | null;
  overduePercent: number;
  yesterdayCompleted: number;
  dashboardUrl: string;
}

function getAttentionCount(data: DigestData): number {
  return data.overdueCount + data.inactiveCount;
}

export async function sendDailyDigest(data: DigestData) {
  const attentionCount = getAttentionCount(data);
  const today = format(new Date(), "d MMMM yyyy");

  const subject =
    attentionCount > 0
      ? `OrbitOS Daily Digest — ${attentionCount} thing${attentionCount !== 1 ? "s" : ""} need${attentionCount === 1 ? "s" : ""} attention`
      : `OrbitOS Daily Digest — All clear for ${today}`;

  const atRiskLine = data.atRiskProjectName
    ? `<li><strong>${data.atRiskProjectName}</strong> — ${Math.round(data.overduePercent * 100)}% of tasks overdue (${data.atRiskStatus === "at-risk" ? "⚠️ At Risk" : "👀 Watch"})</li>`
    : `<li>No projects at risk — good shape.</li>`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #050505; color: #ededed; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 0 auto; padding: 40px 24px; }
    .header { margin-bottom: 32px; }
    .header h1 { font-size: 20px; font-weight: 600; color: #ededed; margin: 0 0 4px; }
    .header p { font-size: 14px; color: #888888; margin: 0; }
    .section { margin-bottom: 28px; }
    .section-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 10px; }
    ul { margin: 0; padding: 0; list-style: none; }
    li { font-size: 15px; color: #d1d5db; padding: 4px 0; }
    .cta { margin-top: 40px; }
    .cta a { display: inline-block; background: #ededed; color: #050505; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 8px; }
    .footer { margin-top: 40px; font-size: 12px; color: #4b5563; border-top: 1px solid #1f2937; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Good morning, ${data.ownerName}.</h1>
      <p>${today} — ${data.orgName}</p>
    </div>

    ${attentionCount > 0 ? `
    <div class="section">
      <div class="section-label">🚨 Needs Attention</div>
      <ul>
        ${data.overdueCount > 0 ? `<li>${data.overdueCount} overdue task${data.overdueCount !== 1 ? "s" : ""}</li>` : ""}
        ${data.inactiveCount > 0 ? `<li>${data.inactiveCount} task${data.inactiveCount !== 1 ? "s" : ""} inactive 48h+</li>` : ""}
      </ul>
    </div>
    ` : `
    <div class="section">
      <div class="section-label">✅ No Blockers</div>
      <ul><li>No overdue or inactive tasks right now.</li></ul>
    </div>
    `}

    <div class="section">
      <div class="section-label">⚠️ Project Risk</div>
      <ul>${atRiskLine}</ul>
    </div>

    <div class="section">
      <div class="section-label">📊 Yesterday</div>
      <ul>
        <li>${data.yesterdayCompleted > 0 ? `${data.yesterdayCompleted} task${data.yesterdayCompleted !== 1 ? "s" : ""} completed` : "No tasks completed"}</li>
      </ul>
    </div>

    <div class="cta">
      <a href="${data.dashboardUrl}">View Dashboard →</a>
    </div>

    <div class="footer">
      You're receiving this because you're the owner of <strong>${data.orgName}</strong> on OrbitOS.<br>
      OrbitOS by Mirai Stack
    </div>
  </div>
</body>
</html>
  `.trim();

  return resend.emails.send({
    from: "OrbitOS <digest@mail.orbit-os.co.za>",
    to: data.ownerEmail,
    subject,
    html,
  });
}
