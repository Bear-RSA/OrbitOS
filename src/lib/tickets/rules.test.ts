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
 *   owner ── exec ── d:design ── manager ── lena (Team Lead) ── mo
 *   owner2 ── d:ops ── mgr2 ── olu (member straight under the Manager)
 *   drifter: wired to nobody
 */
function structure(): TicketStructure {
  const people = new Map<string, { role: StoredRole; departmentId: string | null }>([
    ["owner", { role: "OWNER", departmentId: null }],
    ["owner2", { role: "OWNER", departmentId: null }],
    ["exec", { role: "EXECUTIVE", departmentId: null }],
    ["manager", { role: "MANAGER", departmentId: "design" }],
    ["lena", { role: "TEAM_LEAD", departmentId: "design" }],
    ["mo", { role: "MEMBER", departmentId: "design" }],
    ["mgr2", { role: "MANAGER", departmentId: "ops" }],
    ["olu", { role: "MEMBER", departmentId: "ops" }],
    ["drifter", { role: "MEMBER", departmentId: null }],
  ]);
  return {
    people,
    parents: {
      "p:exec": "p:owner",
      "d:design": "p:exec",
      "p:manager": "d:design",
      "p:lena": "p:manager",
      "p:mo": "p:lena",
      "d:ops": "p:owner2",
      "p:mgr2": "d:ops",
      "p:olu": "p:mgr2",
    },
  };
}

describe("escalationChain", () => {
  const s = structure();

  it("climbs the wires from a member to the Owner, passing through the department", () => {
    expect(escalationChain("mo", s)).toEqual(["lena", "manager", "exec", "owner"]);
  });

  it("starts above the raiser, and skips a missing Team Lead or Executive", () => {
    expect(escalationChain("lena", s)).toEqual(["manager", "exec", "owner"]);
    expect(escalationChain("olu", s)).toEqual(["mgr2", "owner2"]);
  });

  it("falls back to the first Owner when the wires reach none", () => {
    expect(escalationChain("drifter", s)).toEqual(["owner"]);
  });

  it("hands an Owner's issue straight to Internal Management", () => {
    expect(escalationChain("owner", s)).toEqual([]);
  });
});

describe("escalationTarget", () => {
  const s = structure();
  const base = { raiserUid: "mo", s };

  it("moves one step up from whoever holds it", () => {
    expect(escalationTarget({ ...base, holderUid: "lena", heldBy: ["lena"] })).toBe("manager");
    expect(escalationTarget({ ...base, holderUid: "exec", heldBy: ["lena", "manager", "exec"] })).toBe("owner");
  });

  it("goes to Internal Management after the Owner, and never back to someone who held it", () => {
    expect(escalationTarget({ ...base, holderUid: "owner", heldBy: ["lena", "owner"] })).toBeNull();
    expect(escalationTarget({ ...base, holderUid: "lena", heldBy: ["manager", "exec", "owner", "lena"] })).toBeNull();
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
