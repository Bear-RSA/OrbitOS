/* ------------------------------------------------------------------ */
/*  Ranks                                                              */
/*                                                                     */
/*  Where someone sits in the company, top down:                       */
/*                                                                     */
/*    OWNER       gold halo. Changed only through the ownership flow   */
/*                in `lib/members/hierarchy`, never here.              */
/*    EXECUTIVE   violet halo. Owner powers (wired in a later step).   */
/*    MANAGER     blue halo. Outside guests, appoints Team Leads.      */
/*    TEAM_LEAD   teal halo. Given like any other rank, and also shown */
/*                for whoever a department names as its lead          */
/*                (`departments/{id}.leadId`), so leads named before   */
/*                the rank existed keep their halo.                    */
/*    MEMBER      no halo.                                             */
/*                                                                     */
/*  Ranks are separate from Internal Management, which can be held at  */
/*  any rank and shows no halo.                                        */
/*                                                                     */
/*  Pure functions, so the server actions, the avatars and the tests   */
/*  all read the same ladder. The halo styles are in                   */
/*  `components/ui/rank-styles`, where Tailwind can see them.          */
/* ------------------------------------------------------------------ */

/** What `users/{uid}.role` holds. */
export type StoredRole = "OWNER" | "EXECUTIVE" | "MANAGER" | "TEAM_LEAD" | "MEMBER";

/** What a person is shown as: their stored role, or Team Lead when they lead a department. */
export type Rank = StoredRole;

/** The ranks the rank picker sets. Owner has its own flow. */
export type AssignableRank = "EXECUTIVE" | "MANAGER" | "TEAM_LEAD" | "MEMBER";

export const STORED_ROLES: readonly StoredRole[] = ["OWNER", "EXECUTIVE", "MANAGER", "TEAM_LEAD", "MEMBER"];

const LEVEL: Record<Rank, number> = {
  OWNER: 4,
  EXECUTIVE: 3,
  MANAGER: 2,
  TEAM_LEAD: 1,
  MEMBER: 0,
};

export const RANK_LABEL: Record<Rank, string> = {
  OWNER: "Owner",
  EXECUTIVE: "Executive",
  MANAGER: "Manager",
  TEAM_LEAD: "Team Lead",
  MEMBER: "Member",
};

/**
 * Any stored value, read as a role. Older documents hold lowercase
 * `owner`; anything unrecognised is a Member, the least it can grant.
 */
export function normaliseRole(raw: unknown): StoredRole {
  const upper = typeof raw === "string" ? raw.toUpperCase() : "";
  return (STORED_ROLES as readonly string[]).includes(upper) ? (upper as StoredRole) : "MEMBER";
}

/** Whether a stored role lets someone into the workspace at all. Every role does. */
export function isWorkspaceRole(raw: unknown): boolean {
  const upper = typeof raw === "string" ? raw.toUpperCase() : "";
  return (STORED_ROLES as readonly string[]).includes(upper);
}

export function rankLevel(rank: Rank): number {
  return LEVEL[rank];
}

/** The rank someone is shown as. One rank per person: the higher of the two wins. */
export function rankOf(role: unknown, leadsADepartment: boolean): Rank {
  const stored = normaliseRole(role);
  return leadsADepartment && LEVEL[stored] < LEVEL.TEAM_LEAD ? "TEAM_LEAD" : stored;
}

/** Managers and up may name a department's lead and give the Team Lead rank. */
export function canAppointTeamLeads(role: unknown): boolean {
  return LEVEL[normaliseRole(role)] >= LEVEL.MANAGER;
}

/** Ranks this caller may hand out in the rank picker: strictly below their own. */
export function assignableRanksFor(callerRole: unknown): AssignableRank[] {
  const callerLevel = LEVEL[normaliseRole(callerRole)];
  return (["EXECUTIVE", "MANAGER", "TEAM_LEAD", "MEMBER"] as const).filter((r) => LEVEL[r] < callerLevel);
}

export interface RankLimits {
  /** -1 = the plan does not narrow it; 0 = not on this plan. */
  maxManagers: number;
  maxExecutives: number;
  /** Team Leads lead departments, so they come with them: 0 where the plan has none. */
  maxTeamLeads: number;
}

export type Verdict = { ok: true } | { ok: false; error: string };

/**
 * Whether the caller may move the target to `next`.
 *
 * You can only give ranks below your own, and only to someone who is
 * already below you: a Manager cannot be made a Member by another
 * Manager. Seat counts per rank exist only for Executives, who carry
 * Owner powers; every other rank is a plan unlock.
 */
export function checkRankChange(params: {
  callerId: string;
  callerRole: unknown;
  target: { id: string; role: unknown } | null;
  next: AssignableRank;
  limits: RankLimits;
  /** Executives in the workspace now, not counting the target. */
  executiveCount: number;
}): Verdict {
  const { callerId, callerRole, target, next, limits, executiveCount } = params;

  if (!target) return { ok: false, error: "That person isn't in your workspace." };
  if (target.id === callerId) return { ok: false, error: "You can't change your own rank." };

  const current = normaliseRole(target.role);
  if (current === "OWNER") {
    return { ok: false, error: "Owners are changed from the ownership controls, not the rank picker." };
  }
  if (current === next) {
    return { ok: false, error: `They're already ${next === "EXECUTIVE" ? "an" : "a"} ${RANK_LABEL[next]}.` };
  }

  const callerLevel = LEVEL[normaliseRole(callerRole)];
  if (LEVEL[current] >= callerLevel || LEVEL[next] >= callerLevel) {
    return { ok: false, error: "You can only give ranks below your own, to people below you." };
  }

  return checkPlanAllows(next, limits, executiveCount);
}

/** Whether the plan unlocks this rank, and has an Executive seat free when that is the rank. */
function checkPlanAllows(next: StoredRole, limits: RankLimits, executiveCount: number): Verdict {
  if (next === "MANAGER" && limits.maxManagers === 0) {
    return { ok: false, error: "Managers are on the Standard plan and up." };
  }
  if (next === "TEAM_LEAD" && limits.maxTeamLeads === 0) {
    return { ok: false, error: "Team Leads come with departments, on the Pro and Custom plans." };
  }
  if (next === "EXECUTIVE") {
    if (limits.maxExecutives === 0) {
      return { ok: false, error: "Executives are on the Pro and Custom plans." };
    }
    if (limits.maxExecutives > 0 && executiveCount >= limits.maxExecutives) {
      return {
        ok: false,
        error: `This plan allows ${limits.maxExecutives} executive${limits.maxExecutives === 1 ? "" : "s"}.`,
      };
    }
  }
  return { ok: true };
}

/**
 * A rank change made from Admin Tools, by Internal Management.
 *
 * Any rank, Owner included, for anyone, themselves included: Internal
 * Management controls the whole system. Two things still hold. The plan
 * has to unlock the rank, and the workspace keeps at least one Owner,
 * because the org tree and every Owner-only screen hang from one.
 * Owner seats are checked by the action against the plan's quota.
 */
export function checkAdminRankChange(params: {
  target: { id: string; role: unknown } | null;
  next: StoredRole;
  limits: RankLimits;
  /** Executives now, not counting the target. */
  executiveCount: number;
  /** Owners now, counting the target if they are one. */
  ownerCount: number;
}): Verdict {
  const { target, next, limits, executiveCount, ownerCount } = params;

  if (!target) return { ok: false, error: "That person isn't in your workspace." };

  const current = normaliseRole(target.role);
  if (current === next) {
    return { ok: false, error: `They're already ${next === "OWNER" || next === "EXECUTIVE" ? "an" : "a"} ${RANK_LABEL[next]}.` };
  }
  if (current === "OWNER" && ownerCount <= 1) {
    return { ok: false, error: "They're the only Owner. Make someone else an Owner first." };
  }

  return checkPlanAllows(next, limits, executiveCount);
}

/** "Owner", "Manager" and so on, from a stored role. Team Lead needs the department, so see `useMemberRank`. */
export function roleLabel(role: unknown): string {
  return RANK_LABEL[normaliseRole(role)];
}

/** Sort comparator: higher rank first, 0 when they hold the same role. */
export function compareRoles(a: unknown, b: unknown): number {
  return LEVEL[normaliseRole(b)] - LEVEL[normaliseRole(a)];
}
