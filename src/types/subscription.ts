/* ------------------------------------------------------------------ */
/*  Subscription Tier Schema                                           */
/*  Defines operational tiers, resource limits, and Firestore shape.   */
/* ------------------------------------------------------------------ */

import { Timestamp } from "firebase/firestore";

/**
 * The four subscription tiers available in OrbitOS.
 */
export type SubscriptionTier =
  | "exploration"
  | "foundational"
  | "studio_core"
  | "total_visibility";

/**
 * Resource limits enforced per tier.
 * A value of -1 indicates unlimited.
 */
export interface TierLimits {
  maxOwners: number;
  maxMembers: number;
  maxProjects: number;
  /**
   * Concurrent live telemetry streams one user may hold open.
   *
   * Unlike the other limits this one is metered because it COSTS: each open
   * stream is a Firestore listener, and each connect buys a fresh window of
   * document reads. It is the first limit here that maps to a Blaze line item
   * rather than to a seat, which is exactly why it belongs on the tier.
   *
   * The runtime hard ceiling in `lib/telemetry/stream-guard` applies on top
   * and is never widened by this value — -1 means "the tier does not narrow
   * it", not "unlimited".
   */
  maxLiveStreams: number;
  /**
   * Due-soon reminder emails one organization may have sent on its behalf
   * per daily run.
   *
   * Metered for the same reason as `maxLiveStreams`: every reminder is a
   * Resend send, so a workspace with a thousand tasks landing on one day is
   * a line item rather than a seat. -1 means "the tier does not narrow it".
   *
   * The hard ceiling in `lib/tasks/due-reminders` applies on top and is
   * never widened by this value.
   */
  maxTaskRemindersPerDay: number;

  /**
   * Off-platform guests invitable to a single engagement.
   *
   * Metered for the same reason as the two above: every guest is a Resend
   * send on create, another on any reschedule, and another on cancel. It
   * is also the tier's natural shape — inviting outside clients into the
   * workspace is what a studio pays for, not something a free account
   * needs at volume.
   *
   * The hard ceiling in `lib/calendar/invite-dispatch` applies on top and
   * is never widened by this value: -1 means "the tier does not narrow
   * it", not "unlimited".
   */
  maxGuestsPerEngagement: number;

  /**
   * End-of-day debrief emails one PERSON may receive, ever, on this tier.
   *
   * Unlike every other limit here this one is a lifetime count rather than a
   * rate: the debrief is a paid feature, and the free tier's allowance is a
   * trial of it. Three arrive, the third carries the upgrade prompt, and
   * nothing follows until the workspace is on a paid tier. -1 means the tier
   * does not meter it at all.
   *
   * Counted per user rather than per organization because the debrief is a
   * personal mail — it summarises what YOU did today, so one teammate
   * reading their three would otherwise spend everybody else's trial.
   */
  lifetimeDebriefs: number;
}

/**
 * Full tier definition including display metadata and pricing.
 */
export interface TierDefinition {
  id: SubscriptionTier;
  name: string;
  description: string;
  limits: TierLimits;
  priceZAR: number; // Monthly price in ZAR (0 = free)
}

/**
 * Firestore document shape stored at `organizations/{orgId}.subscription`.
 */
export interface OrgSubscription {
  tier: SubscriptionTier;
  status: "active" | "cancelled" | "past_due";
  payfastSubscriptionId?: string;
  currentPeriodStart?: Timestamp;
  currentPeriodEnd?: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Quota resource types that can be validated against tier limits.
 */
export type QuotaResource = "members" | "projects" | "owners";

/* ------------------------------------------------------------------ */
/*  Tier Definitions (Source of Truth)                                  */
/* ------------------------------------------------------------------ */

export const TIER_DEFINITIONS: Record<SubscriptionTier, TierDefinition> = {
  exploration: {
    id: "exploration",
    name: "Exploration",
    description: "Free — for solo operators testing the waters.",
    limits: { maxOwners: 1, maxMembers: 2, maxProjects: 3, maxLiveStreams: 1, maxTaskRemindersPerDay: 10, maxGuestsPerEngagement: 0, lifetimeDebriefs: 3 },
    priceZAR: 0,
  },
  foundational: {
    id: "foundational",
    name: "Foundational",
    description: "Starter — for small teams building momentum.",
    limits: { maxOwners: 1, maxMembers: 5, maxProjects: 5, maxLiveStreams: 2, maxTaskRemindersPerDay: 30, maxGuestsPerEngagement: 3, lifetimeDebriefs: -1 },
    priceZAR: 299,
  },
  studio_core: {
    id: "studio_core",
    name: "Studio Core",
    description: "Team — for growing studios scaling operations.",
    limits: { maxOwners: 3, maxMembers: 10, maxProjects: 10, maxLiveStreams: 4, maxTaskRemindersPerDay: 75, maxGuestsPerEngagement: 10, lifetimeDebriefs: -1 },
    priceZAR: 699,
  },
  total_visibility: {
    id: "total_visibility",
    name: "Total Visibility",
    description: "Growth — full operational command. No limits.",
    limits: { maxOwners: 5, maxMembers: -1, maxProjects: -1, maxLiveStreams: -1, maxTaskRemindersPerDay: -1, maxGuestsPerEngagement: -1, lifetimeDebriefs: -1 },
    priceZAR: 1499,
  },
};

/**
 * Default subscription state for newly created organizations.
 */
export const DEFAULT_SUBSCRIPTION_TIER: SubscriptionTier = "exploration";
