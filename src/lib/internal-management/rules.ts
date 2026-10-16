/* ------------------------------------------------------------------ */
/*  Internal Management                                                */
/*                                                                     */
/*  The few people, usually IT, who hold the key to Admin Tools: every */
/*  rank including Owner, billing, message history, and who else is   */
/*  in Internal Management. It is not a rank. Anyone in the workspace  */
/*  can be in it, it shows no halo, and only its own members are told  */
/*  who else is.                                                       */
/*                                                                     */
/*  This replaces the single "account holder". A workspace that has    */
/*  never set its list starts with that account holder as its one      */
/*  member, so nobody is locked out by the change.                     */
/*                                                                     */
/*  Pure functions, so the actions and the tests read the same rules.  */
/* ------------------------------------------------------------------ */

/**
 * Seats when the plan does not narrow them. Never widened by a plan: only
 * a per-workspace `seatOverride`, sold to a Custom client, goes above it.
 */
export const DEFAULT_MAX_INTERNAL_MANAGEMENT = 3;

/** What every Admin Tools action says once the unlock has run out. The page relocks on it. */
export const ADMIN_LOCKED_ERROR = "Admin Tools is locked. Enter the passcode to open it.";

/** How long one correct passcode keeps Admin Tools open. */
export const ADMIN_UNLOCK_MS = 15 * 60 * 1000;

/**
 * Six digits, where the Vault takes four. The Vault code is shared around
 * the team by word of mouth; this one guards every rank and the billing,
 * so it gets a hundred times the keyspace on top of the same throttle.
 */
export const ADMIN_PASSCODE_LENGTH = 6;

export function isValidAdminPasscode(code: unknown): code is string {
  return typeof code === "string" && /^\d{6}$/.test(code);
}

/**
 * Seats this workspace has.
 *
 * `override` is set by hand on `internal_management/{orgId}` when a Custom
 * client buys more than the default. Until limits are enforced every
 * workspace gets the default.
 */
export function effectiveSeatLimit(params: {
  tierLimit: number;
  override: number | null;
  enforced: boolean;
}): number {
  const { tierLimit, override, enforced } = params;
  if (override !== null && override > 0) return override;
  if (!enforced || tierLimit < 0) return DEFAULT_MAX_INTERNAL_MANAGEMENT;
  return Math.min(tierLimit, DEFAULT_MAX_INTERNAL_MANAGEMENT);
}

export type Verdict = { ok: true } | { ok: false; error: string };

/** Whether someone may be added to, or removed from, Internal Management. */
export function checkMembershipChange(params: {
  change: "add" | "remove";
  members: readonly string[];
  /** The person, if they are in this workspace. */
  target: { id: string } | null;
  seatLimit: number;
}): Verdict {
  const { change, members, target, seatLimit } = params;

  if (!target) return { ok: false, error: "That person isn't in your workspace." };
  const isIn = members.includes(target.id);

  if (change === "add") {
    if (isIn) return { ok: false, error: "They're already in Internal Management." };
    if (members.length >= seatLimit) {
      return {
        ok: false,
        error: `Your plan has ${seatLimit} Internal Management seat${seatLimit === 1 ? "" : "s"}, and ${
          seatLimit === 1 ? "it's" : "they're all"
        } taken.`,
      };
    }
    return { ok: true };
  }

  if (!isIn) return { ok: false, error: "They aren't in Internal Management." };
  if (members.length <= 1) {
    return {
      ok: false,
      error: "They're the last person in Internal Management. Add someone else first.",
    };
  }
  return { ok: true };
}
