import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "OrbitOS <security@mail.orbit-os.co.za>";

/** Stated in the mail so an expired link reads as expected rather than broken. */
const VALID_FOR = "15 minutes";

interface SendVaultPasscodeResetEmailParams {
  email: string;
  resetLink: string;
}

/*
 * Deliberately NOT a "use server" module, for the same reason as
 * `sendPasswordResetEmail.ts`: it takes both the recipient and the link, so
 * exporting it as a server action would be an open relay for sending
 * arbitrary URLs from a verified OrbitOS domain. Only
 * `actions/vault-passcode.ts` imports it, which is where the caller is
 * authorised (OWNER only) and rate-limited.
 */

/**
 * Sends a Vault passcode reset link through Resend.
 *
 * This is the only recovery path for a forgotten Vault passcode by design —
 * there is no in-app "reset" for an already-signed-in owner, because the
 * passcode is meant to hold even against an open OWNER session on a shared
 * machine. Reaching a mailbox the owner controls is the second factor.
 */
export async function sendVaultPasscodeResetEmail({
  email,
  resetLink,
}: SendVaultPasscodeResetEmailParams) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("[VaultPasscodeReset]: RESEND_API_KEY not configured. Email will not be sent.");
      return { success: false, error: "Missing API key" };
    }

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [email],
      subject: "Reset your Vault passcode",
      html: `
        <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
          <p>Hello,</p>
          <p>We received a request to reset the Vault passcode for your OrbitOS workspace.</p>
          <div style="margin: 24px 0;">
            <a href="${resetLink}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Set a new passcode
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
            If you didn't ask to reset the Vault passcode, you can ignore this
            email. The current passcode keeps working until you follow the
            link above.
          </p>
        </div>
      `,
      text: [
        "Hello,",
        "",
        "We received a request to reset the Vault passcode for your OrbitOS workspace.",
        "",
        resetLink,
        "",
        `This link is valid for ${VALID_FOR} and can only be used once.`,
        "",
        "If you didn't ask to reset the Vault passcode, you can ignore this email.",
        "The current passcode keeps working until you follow the link above.",
      ].join("\n"),
      // Read back by the delivery webhook, same as the password-reset tag.
      tags: [{ name: "mail_kind", value: "vault_passcode_reset" }],
    });

    if (error) {
      console.error("[VaultPasscodeReset Failure]:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error("[VaultPasscodeReset Error]:", err);
    return { success: false, error: "Internal server error during email dispatch" };
  }
}
