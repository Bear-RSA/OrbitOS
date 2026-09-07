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
   * People in one call, direct or scheduled.
   *
   * Metered because a call bills in participant-minutes — the first limit
   * here that costs more the longer it is used rather than more the more
   * often it is used. 2 is a working free tier: one operative can call
   * another, which is the thing a solo studio actually needs.
   *
   * The hard ceiling in `lib/calls/ceiling` applies on top and is never
   * widened by this value.
   */
  maxCallParticipants: number;

  /**
   * People from outside the workspace who may enter a call — invited
   * guests and walk-ins alike.
   *
   * 0 means the paid-plan gate, the same idiom `maxGuestsPerEngagement`
   * already uses. Letting an outside client into a room is the shape of
   * the tier: it is what a studio pays for, and it is also the path that
   * puts unauthenticated strangers on the invoice.
   */
  maxCallGuests: number;

  /**
   * Megabytes of company records one organization may keep in the Vault.
   *
   * Metered because stored bytes are the one cost here that keeps
   * arriving: a call ends and an email is sent once, but a scanned
   * archive bills every month until somebody deletes it. It is also
   * where the tier's shape is honest — a solo operator needs somewhere
   * to put a registration certificate, and a studio holding a decade of
   * payroll is buying a filing cabinet.
   *
   * The hard ceiling in `lib/vault/ceiling` applies on top and is never
   * widened by this value: -1 means "the tier does not narrow it".
   */
  maxVaultStorageMb: number;

  /**
   * Documents one organization may keep in the Vault.
   *
   * Paired with the byte allowance because the two guard different
   * failures — bytes guard the storage bill, the count guards every
   * open of the shelf, which subscribes to the whole collection.
   */
  maxVaultDocuments: number;

  /**
   * Calls one organization may transcribe in a calendar month.
   *
   * The odd one out among these, because there is no vendor behind it:
   * capture runs in each participant's own browser and costs nothing per
   * minute. What it meters is Firestore — every utterance in every call
   * is a document write, and a recognizer left running in a forgotten
   * room writes until somebody notices.
   *
   * 0 is the paid-plan gate, the same idiom `maxCallGuests` and
   * `maxGuestsPerEngagement` already use. A written record of what was
   * decided in a meeting is a studio's thing to want, not a solo
   * operator's, and it is also the feature most able to run up a bill
   * quietly.
   *
   * The hard ceiling in `lib/transcripts/ceiling` applies on top and is
   * never widened by this value: -1 means "the tier does not narrow it".
   */
  maxTranscriptsPerMonth: number;
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
    limits: { maxOwners: 1, maxMembers: 2, maxProjects: 3, maxLiveStreams: 1, maxTaskRemindersPerDay: 10, maxGuestsPerEngagement: 0, maxCallParticipants: 2, maxCallGuests: 0, maxVaultStorageMb: 100, maxVaultDocuments: 25, maxTranscriptsPerMonth: 0 },
    priceZAR: 0,
  },
  foundational: {
    id: "foundational",
    name: "Foundational",
    description: "Starter — for small teams building momentum.",
    limits: { maxOwners: 1, maxMembers: 5, maxProjects: 5, maxLiveStreams: 2, maxTaskRemindersPerDay: 30, maxGuestsPerEngagement: 3, maxCallParticipants: 4, maxCallGuests: 0, maxVaultStorageMb: 1024, maxVaultDocuments: 200, maxTranscriptsPerMonth: 20 },
    priceZAR: 299,
  },
  studio_core: {
    id: "studio_core",
    name: "Studio Core",
    description: "Team — for growing studios scaling operations.",
    limits: { maxOwners: 3, maxMembers: 10, maxProjects: 10, maxLiveStreams: 4, maxTaskRemindersPerDay: 75, maxGuestsPerEngagement: 10, maxCallParticipants: 10, maxCallGuests: 5, maxVaultStorageMb: 5120, maxVaultDocuments: 1000, maxTranscriptsPerMonth: 100 },
    priceZAR: 699,
  },
  total_visibility: {
    id: "total_visibility",
    name: "Total Visibility",
    description: "Growth — full operational command. No limits.",
    limits: { maxOwners: 5, maxMembers: -1, maxProjects: -1, maxLiveStreams: -1, maxTaskRemindersPerDay: -1, maxGuestsPerEngagement: -1, maxCallParticipants: -1, maxCallGuests: -1, maxVaultStorageMb: -1, maxVaultDocuments: -1, maxTranscriptsPerMonth: -1 },
    priceZAR: 1499,
  },
};

/**
 * Default subscription state for newly created organizations.
 */
export const DEFAULT_SUBSCRIPTION_TIER: SubscriptionTier = "exploration";
