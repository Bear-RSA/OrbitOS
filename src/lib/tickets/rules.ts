import { normaliseRole, rankLevel, rankOf, type StoredRole } from "@/lib/members/rank";
import { departmentNodeId, parseNodeId } from "@/lib/members/org-chart";

/* ------------------------------------------------------------------ */
/*  Tickets                                                            */
/*                                                                     */
/*  Two kinds of request, one queue:                                   */
/*                                                                     */
/*    ISSUE        anyone. Climbs their department's slots one at a    */
/*                 time when escalated: Team Lead, Manager, Executive, */
/*                 the department's Owner, then Internal Management,   */
/*                 the last desk.                                      */
/*    ACCESS       anyone. A rank, the Vault, a tool. Straight to      */
/*                 Internal Management.                                */
/*    ONBOARDING   Owners and Executives. A new hire's particulars,    */
/*    INTERNAL_MOVE  a promotion or transfer, or someone leaving.      */
/*    OFFBOARDING  Straight to Internal Management, who apply them.    */
/*                                                                     */
/*  Internal Management sees every ticket at every step and can step   */
/*  in on any of them. Everyone else sees the tickets they raised and  */
/*  the ones that have passed through their hands.                     */
/*                                                                     */
/*  Pure functions, so the actions and the tests read the same rules.  */
/* ------------------------------------------------------------------ */

export type TicketType = "ISSUE" | "ACCESS" | "ONBOARDING" | "INTERNAL_MOVE" | "OFFBOARDING";

export type TicketStatus = "OPEN" | "RESOLVED" | "DECLINED" | "WITHDRAWN";

export const TICKET_TYPES: readonly TicketType[] = ["ISSUE", "ACCESS", "ONBOARDING", "INTERNAL_MOVE", "OFFBOARDING"];

export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  ISSUE: "Issue",
  ACCESS: "Access request",
  ONBOARDING: "Onboarding",
  INTERNAL_MOVE: "Internal move",
  OFFBOARDING: "Offboarding",
};

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Open",
  RESOLVED: "Resolved",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
};

/** What someone needs access to, on an ACCESS ticket. */
export type AccessKind = "RANK" | "VAULT" | "ADMIN_TOOLS" | "OTHER";

export const ACCESS_KIND_LABEL: Record<AccessKind, string> = {
  RANK: "A different rank",
  VAULT: "The Vault",
  ADMIN_TOOLS: "Admin Tools",
  OTHER: "Something else",
};

/** Ranks a ticket can ask for. Owner is changed in Admin Tools on purpose, never by a form. */
export type TicketRank = Exclude<StoredRole, "OWNER">;
export const TICKET_RANKS: readonly TicketRank[] = ["EXECUTIVE", "MANAGER", "TEAM_LEAD", "MEMBER"];

/** The particulars each type carries, as saved. */
export type TicketFields =
  | { type: "ISSUE"; subject: string }
  | { type: "ACCESS"; access: AccessKind }
  | {
      type: "ONBOARDING";
      fullName: string;
      email: string;
      jobTitle: string;
      rank: TicketRank;
      departmentId: string | null;
      /** YYYY-MM-DD. */
      startDate: string;
    }
  | {
      type: "INTERNAL_MOVE";
      subjectUid: string;
      /** null = keeps their rank. */
      rank: TicketRank | null;
      /** null = out of every department, "KEEP" = stays where they are. */
      departmentId: string | null | "KEEP";
      effectiveDate: string;
    }
  | { type: "OFFBOARDING"; subjectUid: string; lastDay: string };

/** Types the Owner and Executives raise, which go straight to Internal Management. */
const PEOPLE_TYPES: readonly TicketType[] = ["ONBOARDING", "INTERNAL_MOVE", "OFFBOARDING"];

export function typesRaisableBy(role: unknown): TicketType[] {
  const r = normaliseRole(role);
  return r === "OWNER" || r === "EXECUTIVE" ? [...TICKET_TYPES] : TICKET_TYPES.filter((t) => !PEOPLE_TYPES.includes(t));
}

/** Only issues climb the ranks. Everything else lands with Internal Management. */
export function startsWithInternalManagement(type: TicketType): boolean {
  return type !== "ISSUE";
}

/* ------------------------------------------------------------------ */
/*  Field checks                                                       */
/* ------------------------------------------------------------------ */

export const MAX_SUBJECT = 120;
export const MAX_TEXT = 4000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function date(raw: unknown): string | null {
  const s = text(raw, 10);
  if (!DATE.test(s)) return null;
  return Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) ? null : s;
}

function rank(raw: unknown): TicketRank | null {
  return (TICKET_RANKS as readonly unknown[]).includes(raw) ? (raw as TicketRank) : null;
}

export type Parsed = { ok: true; fields: TicketFields; details: string } | { ok: false; error: string };

/**
 * A raw form, checked and trimmed. People and departments are only shaped
 * here; the action checks they are in the caller's workspace.
 */
export function parseTicketInput(raw: unknown): Parsed {
  const input = (raw ?? {}) as Record<string, unknown>;
  const details = text(input.details, MAX_TEXT);

  switch (input.type) {
    case "ISSUE": {
      const subject = text(input.subject, MAX_SUBJECT);
      if (!subject) return { ok: false, error: "Give the issue a short subject." };
      if (!details) return { ok: false, error: "Say what's wrong, so whoever picks it up can help." };
      return { ok: true, fields: { type: "ISSUE", subject }, details };
    }
    case "ACCESS": {
      const access = input.access as AccessKind;
      if (!(access in ACCESS_KIND_LABEL)) return { ok: false, error: "Choose what you need access to." };
      if (!details) return { ok: false, error: "Say what you need and why." };
      return { ok: true, fields: { type: "ACCESS", access }, details };
    }
    case "ONBOARDING": {
      const fullName = text(input.fullName, 120);
      const email = text(input.email, 254).toLowerCase();
      const r = rank(input.rank);
      const startDate = date(input.startDate);
      if (!fullName) return { ok: false, error: "Add the new hire's full name." };
      if (!EMAIL.test(email)) return { ok: false, error: "Add the email address their invite should go to." };
      if (!r) return { ok: false, error: "Choose the rank they start at." };
      if (!startDate) return { ok: false, error: "Choose their start date." };
      return {
        ok: true,
        fields: {
          type: "ONBOARDING",
          fullName,
          email,
          jobTitle: text(input.jobTitle, 120),
          rank: r,
          departmentId: text(input.departmentId, 200) || null,
          startDate,
        },
        details,
      };
    }
    case "INTERNAL_MOVE": {
      const subjectUid = text(input.subjectUid, 200);
      const r = input.rank === null || input.rank === "KEEP" ? null : rank(input.rank);
      const dept = input.departmentId === "KEEP" ? "KEEP" : text(input.departmentId, 200) || null;
      const effectiveDate = date(input.effectiveDate);
      if (!subjectUid) return { ok: false, error: "Choose who is moving." };
      if (input.rank !== null && input.rank !== "KEEP" && !r) return { ok: false, error: "Choose their new rank." };
      if (r === null && dept === "KEEP") return { ok: false, error: "Change their rank, their department, or both." };
      if (!effectiveDate) return { ok: false, error: "Choose the date it takes effect." };
      return { ok: true, fields: { type: "INTERNAL_MOVE", subjectUid, rank: r, departmentId: dept, effectiveDate }, details };
    }
    case "OFFBOARDING": {
      const subjectUid = text(input.subjectUid, 200);
      const lastDay = date(input.lastDay);
      if (!subjectUid) return { ok: false, error: "Choose who is leaving." };
      if (!lastDay) return { ok: false, error: "Choose their last day." };
      return { ok: true, fields: { type: "OFFBOARDING", subjectUid, lastDay }, details };
    }
    default:
      return { ok: false, error: "Choose what kind of ticket this is." };
  }
}

/* ------------------------------------------------------------------ */
/*  Routing up the ranks                                               */
/* ------------------------------------------------------------------ */

export interface TicketStructure {
  people: ReadonlyMap<string, { role: StoredRole; departmentId: string | null }>;
  /** Each department's Team Lead, Manager and Executive slots, any of them empty. */
  departments: ReadonlyMap<string, { leadId: string | null; managerId: string | null; executiveId: string | null }>;
  /** Org chart department card → its Owner's card, already cleared of dead wires. */
  parents: Readonly<Record<string, string>>;
}

/** Someone's rank as the ladder reads it: a department's named lead counts as a Team Lead. */
function levelOf(uid: string, s: TicketStructure): number {
  const role = s.people.get(uid)?.role;
  const leads = [...s.departments.values()].some((d) => d.leadId === uid);
  return rankLevel(rankOf(role, leads));
}

/** A department's Team Lead: the lead it names, or else someone of that rank filed in it. */
function teamLeadOf(departmentId: string, s: TicketStructure): string | null {
  const named = s.departments.get(departmentId)?.leadId;
  if (named && s.people.has(named)) return named;
  const filed = [...s.people.entries()]
    .filter(([, p]) => p.departmentId === departmentId && p.role === "TEAM_LEAD")
    .map(([id]) => id)
    .sort();
  return filed[0] ?? null;
}

/** The first Owner, the same one every time, for when the chart doesn't say. */
function fallbackOwner(s: TicketStructure): string | null {
  const owners = [...s.people.entries()].filter(([, p]) => p.role === "OWNER").map(([id]) => id).sort();
  return owners[0] ?? null;
}

/**
 * Who an issue climbs through, bottom up, for someone in `departmentId`:
 * its Team Lead, Manager, Executive, then the Owner the department is
 * wired under (or the first Owner, when it isn't wired). Empty slots are
 * skipped, and so is anyone not above the person raising it. After the
 * last name comes Internal Management.
 */
export function escalationChain(raiserUid: string, departmentId: string | null, s: TicketStructure): string[] {
  if (s.people.get(raiserUid)?.role === "OWNER") return [];

  const steps: (string | null)[] = [];
  const department = departmentId ? s.departments.get(departmentId) : undefined;
  if (departmentId && department) {
    steps.push(teamLeadOf(departmentId, s), department.managerId, department.executiveId);
    const wired = parseNodeId(s.parents[departmentNodeId(departmentId)] ?? "");
    steps.push(wired?.kind === "person" ? wired.ref : null);
  }
  steps.push(fallbackOwner(s));

  const floor = levelOf(raiserUid, s);
  const chain: string[] = [];
  for (const uid of steps) {
    if (!uid || uid === raiserUid || chain.includes(uid) || !s.people.has(uid)) continue;
    if (levelOf(uid, s) <= floor) continue;
    // One Owner is enough: the wired one if there is one, the fallback otherwise.
    if (s.people.get(uid)!.role === "OWNER" && chain.some((id) => s.people.get(id)!.role === "OWNER")) continue;
    chain.push(uid);
  }
  return chain;
}

/**
 * Where an escalation goes from the person holding it: the next one up the
 * chain who outranks them and hasn't held it yet, or null for Internal
 * Management.
 */
export function escalationTarget(params: {
  raiserUid: string;
  departmentId: string | null;
  holderUid: string;
  heldBy: readonly string[];
  s: TicketStructure;
}): string | null {
  const { raiserUid, departmentId, holderUid, heldBy, s } = params;
  const above = levelOf(holderUid, s);
  return escalationChain(raiserUid, departmentId, s).find((uid) => !heldBy.includes(uid) && levelOf(uid, s) > above) ?? null;
}

/* ------------------------------------------------------------------ */
/*  What the viewer may do                                             */
/* ------------------------------------------------------------------ */

export interface TicketPermissions {
  note: boolean;
  resolve: boolean;
  escalate: boolean;
  withdraw: boolean;
}

/** For the Tickets page. Internal Management's own buttons live in Admin Tools. */
export function permissionsFor(params: {
  viewerId: string;
  status: TicketStatus;
  raisedBy: string;
  holderId: string | null;
}): TicketPermissions {
  const { viewerId, status, raisedBy, holderId } = params;
  const open = status === "OPEN";
  const holds = open && holderId === viewerId;
  const raised = viewerId === raisedBy;
  return {
    note: open && (holds || raised),
    resolve: holds,
    escalate: holds,
    withdraw: open && raised && !holds,
  };
}
