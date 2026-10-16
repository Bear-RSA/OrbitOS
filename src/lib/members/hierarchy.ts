import type { Department } from "@/types/department";
import type { StoredRole } from "@/lib/members/rank";

/* ------------------------------------------------------------------ */
/*  Workspace hierarchy                                                */
/*                                                                     */
/*  Two tiers of people, top down:                                     */
/*                                                                     */
/*    owners       role OWNER, drawn side by side as equals. Who is an */
/*                 owner is decided in Admin Tools, by Internal        */
/*                 Management (`lib/internal-management`).             */
/*    members      every other rank (`lib/members/rank`), each filed   */
/*                 in at most one department,                          */
/*                 one of whom may lead it under whatever title the    */
/*                 department gives its lead.                          */
/*                                                                     */
/*  The old single account holder, the "primary owner" in code, is     */
/*  still resolved below: it seeds Internal Management in a workspace  */
/*  that has never saved its list.                                     */
/*                                                                     */
/*  The rules live here as pure functions so the server actions and    */
/*  the Teams tree cannot disagree about them, and so they can be      */
/*  tested without Firestore.                                          */
/* ------------------------------------------------------------------ */

/**
 * Hard ceiling on departments per workspace. Always on. A tier may narrow
 * it (`maxDepartments`); nothing widens it. Not a cost guard — a tree
 * with more branches than this stops being readable.
 */
export const HARD_MAX_DEPARTMENTS = 50;

export const MAX_DEPARTMENT_NAME_LENGTH = 60;

export const MAX_LEAD_TITLE_LENGTH = 40;

/** What a department calls its lead when nobody has said otherwise. */
export const DEFAULT_LEAD_TITLE = "Lead";

type Role = StoredRole;

export interface OwnerCandidate {
  id: string;
  createdAtMillis: number;
}

/**
 * Who the account holder is.
 *
 * `ownerId` on the organization is the authority, but only while that
 * person still holds the OWNER role — a stale pointer must not leave the
 * workspace with an account holder who cannot act. Past that, the earliest
 * owner by `createdAt` stands in, which is the person who created the
 * workspace in every org that predates the field being used this way.
 */
export function resolvePrimaryOwnerId(
  storedOwnerId: string | null | undefined,
  owners: OwnerCandidate[]
): string | null {
  if (storedOwnerId && owners.some((o) => o.id === storedOwnerId)) {
    return storedOwnerId;
  }

  const ranked = [...owners].sort((a, b) => {
    if (a.createdAtMillis !== b.createdAtMillis) {
      return a.createdAtMillis - b.createdAtMillis;
    }
    return a.id.localeCompare(b.id);
  });

  return ranked[0]?.id ?? null;
}

/** Trims and collapses whitespace, then checks the length. */
export function normaliseDepartmentName(
  raw: unknown
): { ok: true; name: string } | { ok: false; error: string } {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";

  if (!name) return { ok: false, error: "Give the department a name." };
  if (name.length > MAX_DEPARTMENT_NAME_LENGTH) {
    return {
      ok: false,
      error: `Keep the name under ${MAX_DEPARTMENT_NAME_LENGTH} characters.`,
    };
  }

  return { ok: true, name };
}

/**
 * The title a department gives its lead: "Team lead", "Head of Design".
 * Blank falls back to `DEFAULT_LEAD_TITLE` rather than being refused, since
 * not naming it is a perfectly good answer.
 */
export function normaliseLeadTitle(
  raw: unknown
): { ok: true; title: string } | { ok: false; error: string } {
  const title = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";

  if (!title) return { ok: true, title: DEFAULT_LEAD_TITLE };
  if (title.length > MAX_LEAD_TITLE_LENGTH) {
    return { ok: false, error: `Keep the lead title under ${MAX_LEAD_TITLE_LENGTH} characters.` };
  }

  return { ok: true, title };
}

/** The tier's department allowance, narrowed by the hard ceiling. */
export function effectiveDepartmentLimit(tierLimit: number): number {
  return tierLimit === -1 ? HARD_MAX_DEPARTMENTS : Math.min(tierLimit, HARD_MAX_DEPARTMENTS);
}

/* ------------------------------------------------------------------ */
/*  The tree                                                           */
/* ------------------------------------------------------------------ */

export interface TreePerson {
  id: string;
  name: string;
  role: Role;
  departmentId?: string | null;
}

export interface DepartmentBranch<P> {
  department: Department;
  lead: P | null;
  /** Everyone in the department except the lead, by name. */
  members: P[];
}

export interface OrgTree<P> {
  /**
   * Every owner, one row. The account holder first when `accountHolderId`
   * was given (only ever to the account holder themselves), the rest by
   * name, so nobody else can read the account holder off the order.
   */
  owners: P[];
  departments: DepartmentBranch<P>[];
  /** Members filed nowhere, or in a department that no longer exists. */
  unassigned: P[];
}

const byName = <P extends TreePerson>(a: P, b: P) =>
  (a.name || "").localeCompare(b.name || "");

/**
 * Arranges a roster into the hierarchy the Teams page draws.
 *
 * Owners are always at the top, whatever `departmentId` they carry: a
 * member promoted to owner keeps the field until somebody clears it, and
 * the tree must not file an owner under a department lead.
 */
export function buildOrgTree<P extends TreePerson>(
  people: P[],
  departments: Department[],
  accountHolderId: string | null
): OrgTree<P> {
  const owners = people
    .filter((p) => p.role === "OWNER")
    .sort((a, b) => {
      if ((a.id === accountHolderId) !== (b.id === accountHolderId)) {
        return a.id === accountHolderId ? -1 : 1;
      }
      return byName(a, b);
    });
  const members = people.filter((p) => p.role !== "OWNER");

  const known = new Set(departments.map((d) => d.id));
  const filed = new Map<string, P[]>();
  const unassigned: P[] = [];

  for (const member of members) {
    const id = member.departmentId;
    if (id && known.has(id)) {
      const bucket = filed.get(id);
      if (bucket) bucket.push(member);
      else filed.set(id, [member]);
    } else {
      unassigned.push(member);
    }
  }

  const branches = [...departments]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((department) => {
      const inside = filed.get(department.id) ?? [];
      const lead = inside.find((p) => p.id === department.leadId) ?? null;
      return {
        department,
        lead,
        members: inside.filter((p) => p !== lead).sort(byName),
      };
    });

  return { owners, departments: branches, unassigned: unassigned.sort(byName) };
}
