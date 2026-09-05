"use server";

import { adminDb } from "@/lib/firebase/admin";
import { validateOwner } from "@/lib/auth/permissions";
import { requireServerUid } from "@/lib/auth/session";
import { logActivity } from "@/lib/telemetry";
import {
  TIER_DEFINITIONS,
  DEFAULT_SUBSCRIPTION_TIER,
} from "@/types/subscription";
import type { SubscriptionTier } from "@/types/subscription";
import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";

/* ------------------------------------------------------------------ */
/*  Billing Server Actions                                             */
/*                                                                     */
/*  All actions are OWNER-gated via validateOwner.                     */
/*  Reads/writes target the `organizations/{orgId}.subscription` path. */
/*                                                                     */
/*  The OWNER check runs against the session, never against a uid from */
/*  the caller. It used to take one as an argument, and owner uids are */
/*  not secret — they appear in member lists and activity logs — so a  */
/*  signed-in user could read any workspace's plan and usage, or       */
/*  cancel its paid subscription outright, by naming that owner.       */
/* ------------------------------------------------------------------ */

interface SubscriptionInfo {
  tier: SubscriptionTier;
  tierName: string;
  status: "active" | "cancelled" | "past_due";
  priceZAR: number;
  limits: { maxOwners: number; maxMembers: number; maxProjects: number };
  usage: { members: number; projects: number; owners: number };
  payfastSubscriptionId?: string;
}

/**
 * Retrieves the organization's current subscription state and resource usage.
 * OWNER-only — validates the caller holds the OWNER role before proceeding.
 */
export async function getSubscriptionAction(): Promise<{
  success: boolean;
  data?: SubscriptionInfo;
  error?: string;
}> {
  try {
    const uid = await requireServerUid();

    // 1. Validate OWNER
    const auth = await validateOwner(uid);
    if (!auth.isOwner) {
      return { success: false, error: auth.error || "Unauthorized." };
    }
    const orgId = auth.orgId!;

    // 2. Read org subscription
    const orgDoc = await adminDb.collection("organizations").doc(orgId).get();
    let tier: SubscriptionTier = DEFAULT_SUBSCRIPTION_TIER;
    let status: "active" | "cancelled" | "past_due" = "active";
    let payfastSubscriptionId: string | undefined;

    if (orgDoc.exists) {
      const sub = orgDoc.data()?.subscription;
      if (sub?.tier && sub.tier in TIER_DEFINITIONS) {
        tier = sub.tier as SubscriptionTier;
      }
      if (sub?.status) {
        status = sub.status;
      }
      if (sub?.payfastSubscriptionId) {
        payfastSubscriptionId = sub.payfastSubscriptionId;
      }
    }

    const tierDef = TIER_DEFINITIONS[tier];

    // 3. Count current resource usage
    const [usersSnap, projectsSnap] = await Promise.all([
      adminDb.collection("users").where("orgId", "==", orgId).get(),
      adminDb.collection("projects").where("orgId", "==", orgId).get(),
    ]);

    const members = usersSnap.size;
    const owners = usersSnap.docs.filter(
      (doc) => doc.data().role === "OWNER"
    ).length;
    const projects = projectsSnap.docs.filter(
      (doc) => !doc.data().archived
    ).length;

    return {
      success: true,
      data: {
        tier,
        tierName: tierDef.name,
        status,
        priceZAR: tierDef.priceZAR,
        limits: tierDef.limits,
        usage: { members, projects, owners },
        payfastSubscriptionId,
      },
    };
  } catch (error) {
    console.error("[GetSubscription] Failed:", error);
    return { success: false, error: "Failed to retrieve subscription data." };
  }
}

/**
 * Cancels the organization's paid subscription and downgrades to Exploration.
 * OWNER-only — validates the caller holds the OWNER role before proceeding.
 */
export async function cancelSubscriptionAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const uid = await requireServerUid();

    // 1. Validate OWNER
    const auth = await validateOwner(uid);
    if (!auth.isOwner) {
      return { success: false, error: auth.error || "Unauthorized." };
    }
    const orgId = auth.orgId!;

    // 2. Read current subscription state
    const orgDoc = await adminDb.collection("organizations").doc(orgId).get();
    if (!orgDoc.exists) {
      return { success: false, error: "Organization not found." };
    }

    const sub = orgDoc.data()?.subscription;
    const currentTier = sub?.tier || DEFAULT_SUBSCRIPTION_TIER;

    if (currentTier === "exploration") {
      return { success: false, error: "Already on the Exploration (free) plan." };
    }

    // 3. Downgrade to exploration
    const now = AdminTimestamp.now();
    await adminDb.collection("organizations").doc(orgId).update({
      "subscription.tier": "exploration",
      "subscription.status": "cancelled",
      "subscription.updatedAt": now,
    });

    // 4. Resolve actor name and log telemetry
    const userSnap = await adminDb.collection("users").doc(uid).get();
    const userName = userSnap.data()?.name || "System";

    await logActivity({
      eventType: "SUBSCRIPTION_UPDATED" as any,
      orgId,
      projectId: null,
      actor: { uid, name: userName },
      metadata: {
        previousTier: currentTier,
        newTier: "exploration",
        action: "cancellation",
      },
    });

    console.log("[CancelSubscription] Downgraded to exploration:", { orgId, previousTier: currentTier });
    return { success: true };
  } catch (error) {
    console.error("[CancelSubscription] Failed:", error);
    return { success: false, error: "Cancellation failed. Please try again or contact support." };
  }
}
