"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireAdminTools } from "@/lib/internal-management/store";
import { logActivity } from "@/lib/telemetry";
import {
  TIER_DEFINITIONS,
  DEFAULT_SUBSCRIPTION_TIER,
} from "@/types/subscription";
import type { SubscriptionTier } from "@/types/subscription";
import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { SALES_EMAIL } from "@/lib/billing/checkout";
import { sendUpgradeRequest } from "@/lib/email/sendUpgradeRequest";

/* ------------------------------------------------------------------ */
/*  Billing Server Actions                                             */
/*                                                                     */
/*  Every action is for Internal Management with Admin Tools unlocked, */
/*  via `requireAdminTools`. Billing lives in Admin Tools, and the     */
/*  passcode gate there is checked again here on the server.           */
/*  Reads/writes target the `organizations/{orgId}.subscription` path. */
/*                                                                     */
/*  The check runs against the session, never against a uid from the  */
/*  caller. It used to take one as an argument, and owner uids are not */
/*  secret — they appear in member lists and activity logs — so a      */
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
 * Internal Management only, with Admin Tools unlocked.
 */
export async function getSubscriptionAction(): Promise<{
  success: boolean;
  data?: SubscriptionInfo;
  error?: string;
}> {
  try {
    const caller = await requireAdminTools();
    if (!caller.ok) return { success: false, error: caller.error };
    const { orgId } = caller;

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

    const owners = usersSnap.docs.filter(
      (doc) => doc.data().role === "OWNER"
    ).length;
    // Members exclude owners, matching `validateTierQuota`.
    const members = usersSnap.size - owners;
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
 * Internal Management only, with Admin Tools unlocked.
 */
export async function cancelSubscriptionAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const caller = await requireAdminTools();
    if (!caller.ok) return { success: false, error: caller.error };
    const { uid, orgId } = caller;

    // 2. Read current subscription state
    const orgDoc = await adminDb.collection("organizations").doc(orgId).get();
    if (!orgDoc.exists) {
      return { success: false, error: "Organization not found." };
    }

    const sub = orgDoc.data()?.subscription;
    const currentTier = sub?.tier || DEFAULT_SUBSCRIPTION_TIER;

    if (currentTier === "exploration") {
      return { success: false, error: "Already on the Free plan." };
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

/* ------------------------------------------------------------------ */
/*  Upgrade requests (while checkout is paused)                        */
/*                                                                     */
/*  One document per org at `upgradeRequests/{orgId}`, written only    */
/*  here on the Admin SDK (the rules' catch-all denies clients). A     */
/*  second click for the same plan returns the existing request and    */
/*  sends no second email, so the button cannot be used to spam sales. */
/* ------------------------------------------------------------------ */

/**
 * The plan this workspace is waiting on, if any. A request for the plan
 * the workspace is already on counts as done, so once sales moves an
 * org across the panel stops showing it as pending.
 */
export async function getUpgradeRequestAction(): Promise<{
  success: boolean;
  pendingTier?: SubscriptionTier | null;
  error?: string;
}> {
  try {
    const caller = await requireAdminTools();
    if (!caller.ok) return { success: false, error: caller.error };
    const { orgId } = caller;

    const [reqSnap, orgSnap] = await Promise.all([
      adminDb.collection("upgradeRequests").doc(orgId).get(),
      adminDb.collection("organizations").doc(orgId).get(),
    ]);
    const req = reqSnap.data();
    const currentTier = orgSnap.data()?.subscription?.tier || DEFAULT_SUBSCRIPTION_TIER;

    const pending =
      req?.status === "pending" && req.tier !== currentTier && req.tier in TIER_DEFINITIONS
        ? (req.tier as SubscriptionTier)
        : null;
    return { success: true, pendingTier: pending };
  } catch (error) {
    console.error("[GetUpgradeRequest] Failed:", error);
    return { success: false, error: "Couldn't load your upgrade request." };
  }
}

/**
 * Asks sales to move this workspace onto a paid plan. Internal Management only.
 */
export async function requestUpgradeAction(tier: SubscriptionTier): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const caller = await requireAdminTools();
    if (!caller.ok) return { success: false, error: caller.error };
    const { uid, orgId } = caller;

    const tierDef = Object.prototype.hasOwnProperty.call(TIER_DEFINITIONS, tier)
      ? TIER_DEFINITIONS[tier]
      : null;
    if (!tierDef || tierDef.id === DEFAULT_SUBSCRIPTION_TIER) {
      return { success: false, error: "Choose a paid plan to request." };
    }

    const reqRef = adminDb.collection("upgradeRequests").doc(orgId);
    const [orgSnap, userSnap, reqSnap] = await Promise.all([
      adminDb.collection("organizations").doc(orgId).get(),
      adminDb.collection("users").doc(uid).get(),
      reqRef.get(),
    ]);

    const currentTier: SubscriptionTier =
      orgSnap.data()?.subscription?.tier || DEFAULT_SUBSCRIPTION_TIER;
    if (currentTier === tier) {
      return { success: false, error: `You're already on ${tierDef.name}.` };
    }

    const existing = reqSnap.data();
    if (existing?.status === "pending" && existing.tier === tier) {
      return { success: true };
    }

    const orgName: string = orgSnap.data()?.name || "";
    const ownerName: string = userSnap.data()?.name || "";
    const ownerEmail: string = userSnap.data()?.email || "";

    await reqRef.set({
      orgId,
      orgName,
      tier,
      currentTier,
      status: "pending",
      requestedBy: uid,
      ownerName,
      ownerEmail,
      requestedAt: AdminTimestamp.now(),
    });

    // The saved request is the record; the email is a nudge. A failed
    // send is logged and never turns a saved request into an error.
    const sent = await sendUpgradeRequest({
      to: SALES_EMAIL,
      orgId,
      orgName,
      currentPlan: TIER_DEFINITIONS[currentTier]?.name || currentTier,
      requestedPlan: tierDef.name,
      owner: { name: ownerName, email: ownerEmail },
    });
    if (!sent.success) {
      console.error("[RequestUpgrade] Email failed:", { orgId, error: sent.error });
    }

    await logActivity({
      eventType: "SUBSCRIPTION_UPDATED" as any,
      orgId,
      projectId: null,
      actor: { uid, name: ownerName || "System" },
      metadata: { previousTier: currentTier, requestedTier: tier, action: "upgrade_requested" },
    });

    return { success: true };
  } catch (error) {
    console.error("[RequestUpgrade] Failed:", error);
    return { success: false, error: "Couldn't send your request. Try again in a minute." };
  }
}
