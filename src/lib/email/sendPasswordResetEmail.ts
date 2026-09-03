import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "OrbitOS <security@mail.orbit-os.co.za>";

/**
 * How long a Firebase reset code stays valid. Stated in the mail because
 * a link that silently stops working reads as a broken product rather
 * than an expired credential.
 */
const VALID_FOR = "1 hour";

interface SendPasswordResetEmailParams {
  email: string;
  resetLink: string;
}

/*
 * Deliberately NOT a "use server" module. That directive publishes every
 * export as a client-callable endpoint, and this function takes both the
 * recipient and the link — as an RPC it would be an open relay for sending
 * arbitrary URLs from a verified OrbitOS domain. It is server-side because
 * only `actions/password-reset` imports it, which is where the caller is
 * authorised and rate-limited.
 */

/**
 * Sends a password reset link through Resend rather than Firebase.
 *
 * Firebase's built-in sender has no delivery log, no bounce reporting and
 * no dashboard — a reset that never arrives is indistinguishable from one
 * that was never sent, which is precisely the failure that left this
 * project with an unusable recovery path. Resend is already the mail path
 * for invites and engagements here, on a verified domain, and its webhook
 * (`/api/webhooks/resend`) records what actually happened to each message.
 */
export async function sendPasswordResetEmail({
  email,
  resetLink,
}: SendPasswordResetEmailParams) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("[Password Reset]: RESEND_API_KEY not configured. Email will not be sent.");
      return { success: false, error: "Missing API key" };
    }

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [email],
      subject: "Reset your OrbitOS password",
      html: `
        <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
          <p>Hello,</p>
          <p>We received a request to reset the password for your OrbitOS account.</p>
          <div style="margin: 24px 0;">
            <a href="${resetLink}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Set a new password
            </a>
          </div>
          <p style="font-size: 14px; color: #666;">
            This link is valid for ${VALID_FOR} and can only be used once.
          </p>
          <p style="font-size: 14px; margin-top: 32px; color: #666;">
            Or copy and paste this link into your browser:<br />
            <a href="${resetLink}" style="color: #666; word-break: break-all;">${resetLink}</a>
          </p>
          <p style="font-size: 14px; margin-top: 24px; color: #999;">
            If you didn't ask to reset your password, you can ignore this email.
            Your password will not change until you follow the link above.
          </p>
        </div>
      `,
      text: [
        "Hello,",
        "",
        "We received a request to reset the password for your OrbitOS account.",
        "",
        resetLink,
        "",
        `This link is valid for ${VALID_FOR} and can only be used once.`,
        "",
        "If you didn't ask to reset your password, you can ignore this email.",
        "Your password will not change until you follow the link above.",
      ].join("\n"),
      // Read back by the delivery webhook. Without a tag a bounce lands in
      // `mail_deliveries` with no indication of which path produced it, and
      // a silently failing recovery flow is the one thing this change exists
      // to make visible.
      tags: [{ name: "mail_kind", value: "password_reset" }],
    });

    if (error) {
      console.error("[Password Reset Failure]:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error("[Password Reset Error]:", err);
    return { success: false, error: "Internal server error during email dispatch" };
  }
}
