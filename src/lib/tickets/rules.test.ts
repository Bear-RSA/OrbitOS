import { describe, expect, it } from "vitest";

import type { StoredRole } from "@/lib/members/rank";

import {
  escalationChain,
  escalationTarget,
  parseTicketInput,
  permissionsFor,
  typesRaisableBy,
  type TicketStructure,
} from "./rules";

/*
 *   owner ── d:design  (exec, manager, lead: lena; filed: lena, mo)
 *   owner2    d:ops     (no slots, no wire; filed: olu, tia the TEAM_LEAD rank)
 *   drifter: in no department
 */
function structure(): TicketStructure {
  const people = new Map<string, { role: StoredRole; departmentId: string | null }>([
    ["owner", { role: "OWNER", departmentId: null }],
    ["owner2", { role: "OWNER", departmentId: null }],
    ["exec", { role: "EXECUTIVE", departmentId: null }],
    ["manager", { role: "MANAGER", departmentId: null }],
    ["lena", { role: "MEMBER", departmentId: "design" }],
    ["mo", { role: "MEMBER", departmentId: "design" }],
    ["olu", { role: "MEMBER", departmentId: "ops" }],
    ["tia", { role: "TEAM_LEAD", departmentId: "ops" }],
    ["drifter", { role: "MEMBER", departmentId: null }],
  ]);
  return {
    people,
    departments: new Map([
      ["design", { leadId: "lena", managerId: "manager", executiveId: "exec" }],
      ["ops", { leadId: null, managerId: null, executiveId: null }],
    ]),
    parents: { "d:design": "p:owner2" },
  };
}

describe("escalationChain", () => {
  const s = structure();

  it("climbs a member's department slot by slot to its wired Owner", () => {
    expect(escalationChain("mo", "design", s)).toEqual(["lena", "manager", "exec", "owner2"]);
  });

  it("starts above the raiser", () => {
    expect(escalationChain("lena", "design", s)).toEqual(["manager", "exec", "owner2"]);
  });

  it("finds a Team Lead by rank when the department names none, and falls back to the first Owner", () => {
    expect(escalationChain("olu", "ops", s)).toEqual(["tia", "owner"]);
    expect(escalationChain("drifter", null, s)).toEqual(["owner"]);
  });

  it("hands an Owner's issue straight to Internal Management", () => {
    expect(escalationChain("owner", null, s)).toEqual([]);
  });
});

describe("escalationTarget", () => {
  const s = structure();
  const base = { raiserUid: "mo", departmentId: "design", s };

  it("moves one step up from whoever holds it", () => {
    expect(escalationTarget({ ...base, holderUid: "lena", heldBy: ["lena"] })).toBe("manager");
    expect(escalationTarget({ ...base, holderUid: "exec", heldBy: ["lena", "manager", "exec"] })).toBe("owner2");
  });

  it("goes to Internal Management after the Owner, and never back to someone who held it", () => {
    expect(escalationTarget({ ...base, holderUid: "owner2", heldBy: ["lena", "owner2"] })).toBeNull();
    expect(escalationTarget({ ...base, holderUid: "lena", heldBy: ["manager", "exec", "owner2", "lena"] })).toBeNull();
  });
});
describe("typesRaisableBy", () => {
  it("keeps people changes to Owners and Executives", () => {
    expect(typesRaisableBy("MEMBER")).toEqual(["ISSUE", "ACCESS"]);
    expect(typesRaisableBy("MANAGER")).toEqual(["ISSUE", "ACCESS"]);
    expect(typesRaisableBy("EXECUTIVE")).toContain("ONBOARDING");
    expect(typesRaisableBy("owner")).toContain("OFFBOARDING");
  });
});

describe("parseTicketInput", () => {
  it("needs a subject and details on an issue", () => {
    expect(parseTicketInput({ type: "ISSUE", subject: "  ", details: "x" }).ok).toBe(false);
    expect(parseTicketInput({ type: "ISSUE", subject: "Laptop", details: "Won't boot" })).toEqual({
      ok: true,
      fields: { type: "ISSUE", subject: "Laptop" },
      details: "Won't boot",
    });
  });

  it("checks a new hire's email, rank and start date", () => {
    const base = { type: "ONBOARDING", fullName: "Thandi Nkosi", email: "Thandi@Studio.co.za", rank: "MEMBER", startDate: "2026-11-02" };
    const parsed = parseTicketInput(base);
    expect(parsed.ok && parsed.fields.type === "ONBOARDING" && parsed.fields.email).toBe("thandi@studio.co.za");
    expect(parseTicketInput({ ...base, email: "nope" }).ok).toBe(false);
    expect(parseTicketInput({ ...base, rank: "OWNER" }).ok).toBe(false);
    expect(parseTicketInput({ ...base, startDate: "2 Nov" }).ok).toBe(false);
  });

  it("refuses a move that changes nothing", () => {
    expect(
      parseTicketInput({ type: "INTERNAL_MOVE", subjectUid: "mo", rank: "KEEP", departmentId: "KEEP", effectiveDate: "2026-11-01" }).ok
    ).toBe(false);
    expect(
      parseTicketInput({ type: "INTERNAL_MOVE", subjectUid: "mo", rank: "MANAGER", departmentId: "KEEP", effectiveDate: "2026-11-01" }).ok
    ).toBe(true);
  });
});

describe("permissionsFor", () => {
  it("lets the holder act and the raiser follow up or withdraw", () => {
    const base = { status: "OPEN" as const, raisedBy: "mo", holderId: "lena" };
    expect(permissionsFor({ ...base, viewerId: "lena" })).toEqual({ note: true, resolve: true, escalate: true, withdraw: false });
    expect(permissionsFor({ ...base, viewerId: "mo" })).toEqual({ note: true, resolve: false, escalate: false, withdraw: true });
    expect(permissionsFor({ ...base, viewerId: "manager" })).toEqual({ note: false, resolve: false, escalate: false, withdraw: false });
  });

  it("closes everything once the ticket is done", () => {
    expect(permissionsFor({ viewerId: "lena", status: "RESOLVED", raisedBy: "mo", holderId: "lena" })).toEqual({
      note: false,
      resolve: false,
      escalate: false,
      withdraw: false,
    });
  });
});
