"use server";

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendInviteEmailParams {
  email: string;
  inviteLink: string;
  projectName?: string;
}

/**
 * Sends an invitation email to a new project member using Resend.
 */
export async function sendInviteEmail({
  email,
  inviteLink,
  projectName = "OrbitOS",
}: SendInviteEmailParams) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("[Email]: RESEND_API_KEY not configured. Email will not be sent.");
      return { success: false, error: "Missing API key" };
    }

    const { data, error } = await resend.emails.send({
      from: "OrbitOS <onboarding@resend.dev>", // Using Resend's default testing domain
      to: [email],
      subject: `You're invited to join a project on ${projectName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <h2 style="font-weight: 300; font-size: 24px; color: #000;">Project Invitation</h2>
          <p style="font-size: 16px; line-height: 1.5;">
            You have been invited to join <strong>${projectName}</strong> on OrbitOS. 
            Click the button below to verify your identity and access the workspace.
          </p>
          <div style="margin-top: 32px; margin-bottom: 32px;">
            <a href="${inviteLink}" 
               style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
               Accept Invitation
            </a>
          </div>
          <p style="font-size: 14px; color: #666;">
            Or copy and paste this link into your browser:<br />
            <a href="${inviteLink}" style="color: #000;">${inviteLink}</a>
          </p>
          <hr style="border: 0; border-top: 1px solid #eee; margin-top: 40px;" />
          <p style="font-size: 12px; color: #999;">
            This invitation was sent to ${email}. If you weren't expecting this, you can safely ignore this email.
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
  } catch (err) {
    console.error("[Email Error]:", err);
    return { success: false, error: "Internal server error during email dispatch" };
  }
}
