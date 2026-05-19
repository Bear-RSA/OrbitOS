"use server";

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendInviteEmailParams {
  email: string;
  inviteLink: string;
  projectName?: string;
  inviterName: string;
}

/**
 * Sends an invitation email to a new project member using Resend.
 * Minimal and clean styling.
 */
export async function sendInviteEmail({
  email,
  inviteLink,
  projectName = "OrbitOS",
  inviterName,
}: SendInviteEmailParams) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("[Email]: RESEND_API_KEY not configured. Email will not be sent.");
      return { success: false, error: "Missing API key" };
    }

    const { data, error } = await resend.emails.send({
      from: "OrbitOS <invites@mail.orbit-os.co.za>",
      to: [email],
      subject: `${inviterName} invited you to join ${projectName}.`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
          <p>Hello,</p>
          <p><strong>${inviterName}</strong> has invited you to join <strong>${projectName}</strong>.</p>
          <p>Click the link below to accept the invitation and securely join the workspace (this link expires in 48 hours):</p>
          <div style="margin: 24px 0;">
            <a href="${inviteLink}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Join Project
            </a>
          </div>
          <p style="font-size: 14px; margin-top: 32px; color: #666;">
            Or copy and paste this link into your browser:<br />
            <a href="${inviteLink}" style="color: #666; word-break: break-all;">${inviteLink}</a>
          </p>
          <p style="font-size: 14px; margin-top: 24px; color: #999;">
            If you weren't expecting this, you can ignore this email.
          </p>
        </div>
      `,
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
