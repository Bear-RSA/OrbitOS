"use server";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import crypto from "crypto";

/* ------------------------------------------------------------------ */
/*  Payfast ITN (Instant Transaction Notification) Webhook             */
/*                                                                     */
/*  Receives server-to-server POSTs from Payfast when payment events   */
/*  occur. Verifies the MD5 signature, extracts the subscription tier  */
/*  from custom fields, and updates the org's subscription state.      */
/*                                                                     */
/*  Required env vars:                                                 */
/*    PAYFAST_MERCHANT_ID                                              */
/*    PAYFAST_MERCHANT_KEY                                             */
/*    PAYFAST_PASSPHRASE                                               */
/*    PAYFAST_SANDBOX (optional, defaults to "false")                  */
/* ------------------------------------------------------------------ */

const PAYFAST_VALID_HOSTS = [
  "www.payfast.co.za",
  "sandbox.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
];

/**
 * Verifies the Payfast ITN signature using MD5 hashing.
 *
 * Steps:
 * 1. Sort all received fields alphabetically (excluding "signature")
 * 2. URL-encode values, replace %20 with +
 * 3. Append passphrase as final field
 * 4. Compare MD5 hash to received signature
 */
function verifySignature(
  data: Record<string, string>,
  passphrase: string
): boolean {
  const receivedSignature = data.signature;
  if (!receivedSignature) return false;

  // Build sorted parameter string (exclude signature itself)
  const sortedKeys = Object.keys(data)
    .filter((key) => key !== "signature")
    .sort();

  const paramString = sortedKeys
    .map(
      (key) =>
        `${key}=${encodeURIComponent(data[key]).replace(/%20/g, "+")}`
    )
    .join("&");

  // Append passphrase
  const stringWithPassphrase = `${paramString}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, "+")}`;

  // Generate MD5 hash
  const generatedSignature = crypto
    .createHash("md5")
    .update(stringWithPassphrase)
    .digest("hex");

  return generatedSignature === receivedSignature;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Parse the URL-encoded body
    const body = await req.text();
    const params = new URLSearchParams(body);
    const data: Record<string, string> = {};
    params.forEach((value, key) => {
      data[key] = value;
    });

    console.log("[Payfast ITN] Received notification:", {
      payment_status: data.payment_status,
      m_payment_id: data.m_payment_id,
      custom_str1: data.custom_str1,
      custom_str2: data.custom_str2,
    });

    // 2. Verify signature
    const passphrase = process.env.PAYFAST_PASSPHRASE;
    if (!passphrase) {
      console.error("[Payfast ITN] PAYFAST_PASSPHRASE not configured");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    if (!verifySignature(data, passphrase)) {
      console.error("[Payfast ITN] Invalid signature — possible spoofing attempt");
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    // 3. Validate merchant ID
    const expectedMerchantId = process.env.PAYFAST_MERCHANT_ID;
    if (expectedMerchantId && data.merchant_id !== expectedMerchantId) {
      console.error("[Payfast ITN] Merchant ID mismatch:", {
        received: data.merchant_id,
        expected: expectedMerchantId,
      });
      return NextResponse.json({ error: "Merchant ID mismatch" }, { status: 403 });
    }

    // 4. Extract custom fields
    //    custom_str1 = orgId
    //    custom_str2 = tier (e.g., "foundational", "studio_core", "total_visibility")
    const orgId = data.custom_str1;
    const tier = data.custom_str2;
    const paymentStatus = data.payment_status;
    const payfastSubscriptionId = data.token || data.m_payment_id;

    if (!orgId) {
      console.error("[Payfast ITN] Missing orgId in custom_str1");
      return NextResponse.json({ error: "Missing org reference" }, { status: 400 });
    }

    // 5. Verify org exists
    const orgRef = adminDb.collection("organizations").doc(orgId);
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) {
      console.error("[Payfast ITN] Organization not found:", orgId);
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // 6. Process based on payment status
    const now = AdminTimestamp.now();

    if (paymentStatus === "COMPLETE") {
      // Successful payment — activate the new tier
      const validTiers = ["exploration", "foundational", "studio_core", "total_visibility"];
      const activeTier = validTiers.includes(tier) ? tier : "exploration";

      await orgRef.update({
        "subscription.tier": activeTier,
        "subscription.status": "active",
        "subscription.payfastSubscriptionId": payfastSubscriptionId || null,
        "subscription.currentPeriodStart": now,
        "subscription.updatedAt": now,
      });

      console.log("[Payfast ITN] Subscription activated:", { orgId, tier: activeTier });

      // Log activity
      try {
        const orgData = orgSnap.data();
        const ownerId = orgData?.ownerId;
        let actorName = "System";
        if (ownerId) {
          const ownerSnap = await adminDb.collection("users").doc(ownerId).get();
          actorName = ownerSnap.data()?.name || "System";
        }

        const { logActivity } = await import("@/lib/telemetry");
        await logActivity({
          eventType: "SUBSCRIPTION_UPDATED" as any,
          orgId,
          projectId: null,
          actor: { uid: ownerId || "system", name: actorName },
          metadata: {
            tier: activeTier,
            paymentStatus,
            payfastSubscriptionId,
          },
        });
      } catch (telemetryErr) {
        console.error("[Payfast ITN] Telemetry logging failed:", telemetryErr);
      }
    } else if (paymentStatus === "CANCELLED") {
      // Subscription cancelled — downgrade to exploration
      await orgRef.update({
        "subscription.tier": "exploration",
        "subscription.status": "cancelled",
        "subscription.updatedAt": now,
      });

      console.log("[Payfast ITN] Subscription cancelled, downgraded to exploration:", orgId);
    } else {
      // Other statuses: log but take no action
      console.log("[Payfast ITN] Unhandled payment status:", paymentStatus, "for org:", orgId);
    }

    // 7. Return 200 OK (required by Payfast)
    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("[Payfast ITN] Webhook processing error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
