import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "OrbitOS <security@mail.orbit-os.co.za>";

/*
 * Deliberately NOT a "use server" module, like the Vault reset sender:
 * these take the recipients and, for the reset, the link. Only
 * `actions/admin-tools.ts` imports them, after checking the caller is in
 * Internal Management.
 */

type SendResult = { success: true; id?: string } | { success: false; error: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function send(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  kind: string;
}): Promise<SendResult> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("[InternalManagementEmail]: RESEND_API_KEY not configured. Email will not be sent.");
      return { success: false, error: "Missing API key" };
    }
    if (params.to.length === 0) return { success: false, error: "No recipients" };

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      tags: [{ name: "mail_kind", value: params.kind }],
    });

    if (error) {
      console.error("[InternalManagementEmail Failure]:", error);
      return { success: false, error: error.message };
    }
    return { success: true, id: data?.id };
  } catch (err) {
    console.error("[InternalManagementEmail Error]:", err);
    return { success: false, error: "Internal server error during email dispatch" };
  }
}

/**
 * Tells everyone in Internal Management, and the person changed, that
 * someone joined or left it. This is what keeps one member from quietly
 * locking the others out: every change reaches every mailbox.
 */
export async function sendInternalManagementChangeEmail(params: {
  to: string[];
  change: "added" | "removed";
  actorName: string;
  memberName: string;
  workspaceName: string;
}): Promise<SendResult> {
  const actor = escapeHtml(params.actorName);
  const member = escapeHtml(params.memberName);
  const workspace = escapeHtml(params.workspaceName || "your workspace");
  const sentence =
    params.change === "added"
      ? `${actor} added ${member} to Internal Management in ${workspace}.`
      : `${actor} removed ${member} from Internal Management in ${workspace}.`;
  const plain =
    params.change === "added"
      ? `${params.actorName} added ${params.memberName} to Internal Management in ${params.workspaceName || "your workspace"}.`
      : `${params.actorName} removed ${params.memberName} from Internal Management in ${params.workspaceName || "your workspace"}.`;

  return send({
    to: params.to,
    subject: params.change === "added" ? "Someone joined Internal Management" : "Someone left Internal Management",
    kind: "internal_management_change",
    html: `
      <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
        <p>${sentence}</p>
        <p style="font-size: 14px; color: #666;">
          Internal Management holds the key to Admin Tools: every rank, billing and message history.
          Everyone in it gets this email whenever the list changes.
        </p>
        <p style="font-size: 14px; color: #999; margin-top: 24px;">
          If you didn't expect this change, open Admin Tools in OrbitOS and check who is in Internal Management.
        </p>
      </div>
    `,
    text: [
      plain,
      "",
      "Internal Management holds the key to Admin Tools: every rank, billing and message history.",
      "Everyone in it gets this email whenever the list changes.",
      "",
      "If you didn't expect this change, open Admin Tools in OrbitOS and check who is in Internal Management.",
    ].join("\n"),
  });
}

/** Sends the Admin Tools passcode reset link to the person who asked. */
export async function sendAdminPasscodeResetEmail(params: {
  email: string;
  resetLink: string;
}): Promise<SendResult> {
  const link = escapeHtml(params.resetLink);
  return send({
    to: [params.email],
    subject: "Reset your Admin Tools passcode",
    kind: "admin_passcode_reset",
    html: `
      <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
        <p>We received a request to reset the Admin Tools passcode for your OrbitOS workspace.</p>
        <div style="margin: 24px 0;">
          <a href="${link}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Set a new passcode
          </a>
        </div>
        <p style="font-size: 14px; color: #666;">This link is valid for 15 minutes and can only be used once.</p>
        <p style="font-size: 14px; color: #666;">
          Or copy and paste this link into your browser:<br />
          <a href="${link}" style="color: #666; word-break: break-all;">${link}</a>
        </p>
        <p style="font-size: 14px; margin-top: 24px; color: #999;">
          If you didn't ask for this, you can ignore it. The current passcode keeps working.
        </p>
      </div>
    `,
    text: [
      "We received a request to reset the Admin Tools passcode for your OrbitOS workspace.",
      "",
      params.resetLink,
      "",
      "This link is valid for 15 minutes and can only be used once.",
      "If you didn't ask for this, you can ignore it. The current passcode keeps working.",
    ].join("\n"),
  });
}
