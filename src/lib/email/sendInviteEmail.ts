import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/*
 * Deliberately NOT a "use server" module. As one, every export became a
 * callable action endpoint: anyone could post their own recipient and link
 * and have OrbitOS mail it from invites@. Only `actions/invites.ts` imports
 * this, after it has checked the caller owns the workspace.
 */

interface SendInviteEmailParams {
  email: string;
  inviteLink: string;
  projectName?: string;
  inviterName: string;
  /** Days until the link stops working. Must match the invite's `expiresAt`. */
  expiresInDays: number;
}

/** Names come from editable profiles; never let one write markup into the email. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Sends an invitation email to a new workspace member using Resend.
 * Minimal and clean styling.
 */
export async function sendInviteEmail({
  email,
  inviteLink,
  projectName = "OrbitOS",
  inviterName,
  expiresInDays,
}: SendInviteEmailParams) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("[Email]: RESEND_API_KEY not configured. Email will not be sent.");
      return { success: false, error: "Missing API key" };
    }

    const inviter = escapeHtml(inviterName);
    const workspace = escapeHtml(projectName);
    const link = escapeHtml(inviteLink);
    const lifetime = `${expiresInDays} day${expiresInDays === 1 ? "" : "s"}`;

    const { data, error } = await resend.emails.send({
      from: "OrbitOS <invites@mail.orbit-os.co.za>",
      to: [email],
      // Subject lines are plain text; Resend encodes them, so no escaping here.
      subject: `${inviterName} invited you to join ${projectName}`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
          <p>Hello,</p>
          <p><strong>${inviter}</strong> has invited you to join <strong>${workspace}</strong> on OrbitOS.</p>
          <p>Use the button below to accept. The link works for ${lifetime}.</p>
          <div style="margin: 24px 0;">
            <a href="${link}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Accept invite
            </a>
          </div>
          <p style="font-size: 14px; margin-top: 32px; color: #666;">
            Or copy and paste this link into your browser:<br />
            <a href="${link}" style="color: #666; word-break: break-all;">${link}</a>
          </p>
          <p style="font-size: 14px; margin-top: 24px; color: #999;">
            If you weren't expecting this, you can ignore this email.
          </p>
        </div>
      `,
      text: [
        `${inviterName} has invited you to join ${projectName} on OrbitOS.`,
        "",
        `Accept the invite (the link works for ${lifetime}):`,
        inviteLink,
        "",
        "If you weren't expecting this, you can ignore this email.",
      ].join("\n"),
    });

    if (error) {
      console.error("[Email Failure]:", error);
      return { success: false, error: error.message };
    }

    console.log("[Email Sent Successfully]:", data?.id);
    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("[Email Error]:", err);
    return { success: false, error: "Internal server error during email dispatch" };
  }
}
