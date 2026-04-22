import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Force Node.js runtime
export const runtime = "nodejs";

/**
 * Cloudinary Webhook Ingestion Endpoint
 * 
 * Security: URL-token verification using HMAC of the API secret.
 * The webhook URL configured in Cloudinary must include ?token=<WEBHOOK_TOKEN>.
 * 
 * To generate your token, run in Node:
 *   crypto.createHmac("sha256", CLOUDINARY_API_SECRET).update("orbitos-webhook").digest("hex")
 * 
 * This is secure because:
 * 1. Only someone with access to the Cloudinary dashboard can set the notification URL
 * 2. The URL is transmitted over HTTPS (ngrok/Vercel), so the token cannot be intercepted
 * 3. The token is derived from the API secret, so no new secrets are needed
 */

function getWebhookToken(): string {
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!secret) throw new Error("CLOUDINARY_API_SECRET is not set");
  return crypto.createHmac("sha256", secret).update("orbitos-webhook").digest("hex");
}

export async function GET() {
  return NextResponse.json({ 
    status: "active", 
    message: "OrbitOS Cloudinary Webhook is operational. Use POST with ?token=... for ingestion." 
  });
}

export async function POST(req: NextRequest) {
  try {
    // ─── Step 1: Verify URL token ─────────────────────────────────────────
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const expectedToken = getWebhookToken();

    console.log("[Webhook] Received notification. Token present:", !!token);

    if (!token || token !== expectedToken) {
      console.error("[Webhook] Invalid or missing URL token:", token);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ─── Step 2: Parse the body ───────────────────────────────────────────
    const payload = await req.json();

    // Only process successful uploads
    if (payload.notification_type !== "upload") {
      return NextResponse.json({ message: "Ignored notification type" });
    }

    // ─── File registration is handled by registerProjectFileAction ────────
    // The client-side upload flow already registers the file via the server
    // action. This webhook previously created a duplicate "System" record.
    // We acknowledge the notification and return immediately.
    console.log("[Webhook] Upload notification acknowledged. File registration handled by server action.");

    return NextResponse.json({ success: true, message: "Acknowledged. Registration handled by server action." });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
