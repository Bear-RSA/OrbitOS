import { adminDb } from "@/lib/firebase/admin";

/**
 * Verifies if a user has access to a project.
 * A user has access if they belong to the same organization as the project.
 */
export async function verifyProjectAccess(userId: string, projectId: string) {
  try {
    // 1. Get project
    const projectDoc = await adminDb.collection("projects").doc(projectId).get();
    if (!projectDoc.exists) {
      return { hasAccess: false, error: "Project not found" };
    }
    const projectData = projectDoc.data();
    const projectOrgId = projectData?.orgId;

    // 2. Get user
    const userDoc = await adminDb.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return { hasAccess: false, error: "User not found" };
    }
    const userData = userDoc.data();
    const userOrgId = userData?.orgId;

    if (!userData || !["OWNER", "MEMBER"].includes(userData.role)) {
      return { hasAccess: false, error: "Access denied. Valid operational role required." };
    }

    // 3. Compare org IDs
    if (projectOrgId && userOrgId && projectOrgId === userOrgId) {
      return { hasAccess: true, orgId: projectOrgId };
    }

    return { hasAccess: false, error: "Unauthorized access to project" };
  } catch (error) {
    console.error("Error verifying project access:", error);
    return { hasAccess: false, error: "Internal server error" };
  }
}

/**
 * Validates if a user exists and holds the OWNER role in their organization.
 */
export async function validateOwner(userId: string, targetUserId?: string, projectId?: string) {
  try {
    if (!userId) {
      return { isOwner: false, error: "User ID is required" };
    }

    const userDoc = await adminDb.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return { isOwner: false, error: "User not found" };
    }
    const userData = userDoc.data();
    if (!userData || !userData.orgId) {
      return { isOwner: false, error: "User lacks organization assignment" };
    }
    
    if (userData.role !== "OWNER") {
      return { isOwner: false, error: "Unauthorized. Requires OWNER operations clearance." };
    }

    const callerOrgId = userData.orgId;

    if (projectId) {
      const projectDoc = await adminDb.collection("projects").doc(projectId).get();
      if (!projectDoc.exists) {
        return { isOwner: false, error: "Project not found" };
      }
      if (projectDoc.data()?.orgId !== callerOrgId) {
        return { isOwner: false, error: "Project does not belong to your workspace" };
      }
    }

    if (targetUserId) {
      const targetDoc = await adminDb.collection("users").doc(targetUserId).get();
      if (!targetDoc.exists) {
        return { isOwner: false, error: "Target user not found" };
      }
      if (targetDoc.data()?.orgId !== callerOrgId) {
        return { isOwner: false, error: "Target user is not a member of your workspace" };
      }
    }
    
    return { isOwner: true, orgId: callerOrgId };
  } catch (error) {
    console.error("Error validating owner status:", error);
    return { isOwner: false, error: "Internal server error during authorization" };
  }
}

/* ------------------------------------------------------------------ */
/*  Tier Quota Validation                                              */
/* ------------------------------------------------------------------ */

import {
  TIER_DEFINITIONS,
  DEFAULT_SUBSCRIPTION_TIER,
} from "@/types/subscription";
import type { SubscriptionTier, QuotaResource } from "@/types/subscription";

/**
 * Master switch for tier enforcement.
 *
 * Tiers are defined and priced, but nothing is gated yet: features are being
 * built out in full first, and the decision about what lands in which tier
 * comes at the end. Until then every quota check passes.
 *
 * Leaving the call sites wired up while this is off means turning enforcement
 * on is a one-line env change, not a re-integration. Before flipping it,
 * backfill `organizations/{id}.subscription` — orgs without that field fall
 * through to `exploration` (1 owner / 2 members / 3 projects), which would
 * lock existing workspaces out of creating anything.
 */
const GUARDRAILS_ENABLED = process.env.BILLING_GUARDRAILS_ENABLED === "true";

/* ------------------------------------------------------------------ */
/*  Tier resolution                                                     */
/* ------------------------------------------------------------------ */

/**
 * Tier lookups are cached because the live-telemetry check runs on every SSE
 * connect, and paying an org read to decide whether to allow a stream would
 * undercut the point of guarding stream cost in the first place. A tier change
 * takes effect within the TTL, which is fine for a monthly subscription.
 */
const TIER_CACHE_TTL_MS = 60_000;

const tierCache = new Map<string, { tier: SubscriptionTier; expires: number }>();

async function resolveOrgTier(orgId: string): Promise<SubscriptionTier> {
  const now = Date.now();
  const hit = tierCache.get(orgId);
  if (hit && hit.expires > now) return hit.tier;

  let tier: SubscriptionTier = DEFAULT_SUBSCRIPTION_TIER;
  try {
    const orgDoc = await adminDb.collection("organizations").doc(orgId).get();
    const sub = orgDoc.exists ? orgDoc.data()?.subscription : null;
    if (sub?.tier && sub.tier in TIER_DEFINITIONS) {
      tier = sub.tier as SubscriptionTier;
    }
  } catch (error) {
    console.error("Error resolving organization tier:", error);
    // Fall through to the default rather than failing the caller — the hard
    // cost ceilings still apply on top of whatever this returns.
  }

  tierCache.set(orgId, { tier, expires: now + TIER_CACHE_TTL_MS });
  return tier;
}

/**
 * Per-user concurrent live-telemetry allowance for an organization.
 *
 * Returns -1 while enforcement is off, meaning "the tier does not narrow the
 * allowance" — the hard ceiling in `lib/telemetry/stream-guard` still governs.
 * That split is deliberate: cost protection must be live NOW, on Blaze, while
 * the paywall stays dark until tier assignment is finalised.
 */
export async function resolveLiveStreamLimit(orgId: string): Promise<number> {
  if (!GUARDRAILS_ENABLED) return -1;
  if (!orgId) return -1;

  const tier = await resolveOrgTier(orgId);
  return TIER_DEFINITIONS[tier].limits.maxLiveStreams;
}

/**
 * Per-organization allowance of due-soon reminder emails for one daily run.
 *
 * Same contract as `resolveLiveStreamLimit`: -1 means "the tier does not
 * narrow the allowance", and the hard ceiling in `lib/tasks/due-reminders`
 * governs regardless. Reminders are a Resend invoice, so the ceiling has to
 * be live now even while the paywall stays dark.
 */
export async function resolveTaskReminderLimit(orgId: string): Promise<number> {
  if (!GUARDRAILS_ENABLED) return -1;
  if (!orgId) return -1;

  const tier = await resolveOrgTier(orgId);
  return TIER_DEFINITIONS[tier].limits.maxTaskRemindersPerDay;
}

/**
 * Off-platform guests one engagement may carry for this organization.
 *
 * Same contract as the two above: -1 means "the tier does not narrow the
 * allowance", and the hard ceiling in `lib/calendar/invite-dispatch`
 * governs regardless. Guest invites are a Resend invoice, so that ceiling
 * is live now even while the paywall stays dark.
 */
/**
 * Lifetime end-of-day debriefs one person may receive under this org's tier.
 *
 * Deliberately NOT gated on `GUARDRAILS_ENABLED`, which is the one exception
 * among the resolvers here and worth being explicit about. That flag exists
 * to stop quota enforcement retroactively locking existing workspaces out of
 * things they already had — projects, members, owners. The debrief is a new
 * feature nobody has today, so there is no entitlement to revoke and nothing
 * to backfill first: metering it from the start is the feature as specified,
 * not enforcement switched on early.
 *
 * -1 means the tier does not meter it. A missing `subscription` field
 * resolves to `exploration` and therefore to the three-mail trial, which is
 * the correct reading of an unpaid workspace.
 */
export async function resolveDebriefAllowance(orgId: string): Promise<number> {
  if (!orgId) return TIER_DEFINITIONS[DEFAULT_SUBSCRIPTION_TIER].limits.lifetimeDebriefs;

  const tier = await resolveOrgTier(orgId);
  return TIER_DEFINITIONS[tier].limits.lifetimeDebriefs;
}

export async function resolveGuestInviteLimit(orgId: string): Promise<number> {
  if (!GUARDRAILS_ENABLED) return -1;
  if (!orgId) return -1;

  const tier = await resolveOrgTier(orgId);
  return TIER_DEFINITIONS[tier].limits.maxGuestsPerEngagement;
}

/**
 * Validates whether an organization's current resource usage allows
 * one more of the requested resource type under its active subscription tier.
 *
 * Usage: call before creating projects, inviting members, or promoting owners.
 */
export async function validateTierQuota(
  orgId: string,
  resource: QuotaResource
): Promise<{ allowed: boolean; error?: string; current?: number; limit?: number }> {
  // Pre-enforcement phase — see GUARDRAILS_ENABLED above.
  if (!GUARDRAILS_ENABLED) {
    return { allowed: true };
  }

  try {
    if (!orgId) {
      return { allowed: false, error: "Organization ID is required." };
    }

    // 1. Fetch org subscription state
    const tier = await resolveOrgTier(orgId);
    const limits = TIER_DEFINITIONS[tier].limits;

    // 2. Resolve the applicable limit
    let maxAllowed: number;
    switch (resource) {
      case "members":
        maxAllowed = limits.maxMembers;
        break;
      case "projects":
        maxAllowed = limits.maxProjects;
        break;
      case "owners":
        maxAllowed = limits.maxOwners;
        break;
      default:
        return { allowed: false, error: "Unknown resource type." };
    }

    // Unlimited tier — skip counting
    if (maxAllowed === -1) {
      return { allowed: true };
    }

    // 3. Count current usage from Firestore
    let currentCount = 0;

    if (resource === "members") {
      // Count all users (OWNER + MEMBER) in the org
      const usersSnap = await adminDb
        .collection("users")
        .where("orgId", "==", orgId)
        .get();
      currentCount = usersSnap.size;
    } else if (resource === "projects") {
      // Count active (non-archived) projects in the org
      const projectsSnap = await adminDb
        .collection("projects")
        .where("orgId", "==", orgId)
        .get();
      // Filter out archived projects in-memory (Firestore lacks != on missing fields)
      currentCount = projectsSnap.docs.filter(
        (doc) => !doc.data().archived
      ).length;
    } else if (resource === "owners") {
      const ownersSnap = await adminDb
        .collection("users")
        .where("orgId", "==", orgId)
        .where("role", "==", "OWNER")
        .get();
      currentCount = ownersSnap.size;
    }

    // 4. Evaluate
    if (currentCount >= maxAllowed) {
      const tierName = TIER_DEFINITIONS[tier].name;
      return {
        allowed: false,
        error: `${tierName} plan limit reached: ${currentCount}/${maxAllowed} ${resource}. Upgrade your subscription to add more.`,
        current: currentCount,
        limit: maxAllowed,
      };
    }

    return { allowed: true, current: currentCount, limit: maxAllowed };
  } catch (error) {
    console.error("Error validating tier quota:", error);
    return { allowed: false, error: "Internal server error during quota validation." };
  }
}
