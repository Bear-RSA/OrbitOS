import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
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

export async function POST(req: NextRequest) {
  try {
    // ─── Step 1: Verify URL token ─────────────────────────────────────────
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const expectedToken = getWebhookToken();

    if (!token || token !== expectedToken) {
      console.error("[Webhook] Invalid or missing URL token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ─── Step 2: Parse the body ───────────────────────────────────────────
    const payload = await req.json();

    // Only process successful uploads
    if (payload.notification_type !== "upload") {
      return NextResponse.json({ message: "Ignored notification type" });
    }

    const { public_id, secure_url, bytes, format, resource_type } = payload;

    // ─── Step 3: Parse Project ID from path ───────────────────────────────
    // Expected public_id format: "projects/{projectId}/assets/{filename}"
    const pathParts = public_id.split("/");
    if (pathParts[0] !== "projects" || pathParts[2] !== "assets") {
      console.warn("[Webhook] Non-project asset, ignoring:", public_id);
      return NextResponse.json({ message: "Not a project asset" });
    }

    const projectId = pathParts[1];

    // ─── Step 4: Validate project exists ──────────────────────────────────
    const projectDoc = await adminDb.collection("projects").doc(projectId).get();
    if (!projectDoc.exists) {
      console.error("[Webhook] Project not found:", projectId);
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // ─── Step 5: Write to Firestore ───────────────────────────────────────
    const fileId = public_id.replace(/\//g, "_");
    const fileRef = adminDb.collection("projects").doc(projectId).collection("files").doc(fileId);

    await fileRef.set({
      id: fileId,
      projectId,
      name: payload.original_filename || public_id.split("/").pop(),
      url: secure_url,
      publicId: public_id,
      size: bytes,
      type: `${resource_type}/${format}`,
      uploadedBy: "system_webhook",
      createdAt: FieldValue.serverTimestamp(),
      ingestedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log("[Webhook] ✓ File ingested:", fileId, "→ project:", projectId);
    return NextResponse.json({ success: true, fileId: fileRef.id });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
