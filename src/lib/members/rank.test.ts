import { describe, expect, it } from "vitest";

import {
  assignableRanksFor,
  checkAdminRankChange,
  canAppointTeamLeads,
  checkRankChange,
  normaliseRole,
  rankOf,
  type RankLimits,
} from "./rank";

const OPEN: RankLimits = { maxManagers: -1, maxExecutives: -1, maxTeamLeads: -1 };

function change(over: Partial<Parameters<typeof checkRankChange>[0]> = {}) {
  return checkRankChange({
    callerId: "owner",
    callerRole: "OWNER",
    target: { id: "t", role: "MEMBER" },
    next: "MANAGER",
    limits: OPEN,
    executiveCount: 0,
    ...over,
  });
}

describe("normaliseRole", () => {
  it("reads lowercase legacy roles", () => {
    expect(normaliseRole("owner")).toBe("OWNER");
  });

  it("reads anything unknown as a Member", () => {
    expect(normaliseRole("ADMIN")).toBe("MEMBER");
    expect(normaliseRole(undefined)).toBe("MEMBER");
  });
});

describe("rankOf", () => {
  it("makes a Member who leads a department a Team Lead", () => {
    expect(rankOf("MEMBER", true)).toBe("TEAM_LEAD");
  });

  it("keeps the higher rank when a Manager leads a department", () => {
    expect(rankOf("MANAGER", true)).toBe("MANAGER");
  });
});

describe("who may give what", () => {
  it("lets an Owner give Executive and below", () => {
    expect(assignableRanksFor("OWNER")).toEqual(["EXECUTIVE", "MANAGER", "TEAM_LEAD", "MEMBER"]);
  });

  it("lets an Executive give Manager and below", () => {
    expect(assignableRanksFor("EXECUTIVE")).toEqual(["MANAGER", "TEAM_LEAD", "MEMBER"]);
  });

  it("lets a Manager give Team Lead", () => {
    expect(assignableRanksFor("MANAGER")).toEqual(["TEAM_LEAD", "MEMBER"]);
    expect(canAppointTeamLeads("MANAGER")).toBe(true);
    expect(canAppointTeamLeads("MEMBER")).toBe(false);
  });
});

describe("checkRankChange", () => {
  it("allows an Owner to make a Member a Manager", () => {
    expect(change()).toEqual({ ok: true });
  });

  it("refuses changing your own rank", () => {
    expect(change({ target: { id: "owner", role: "OWNER" } }).ok).toBe(false);
  });

  it("leaves Owners to the ownership flow", () => {
    expect(change({ target: { id: "t", role: "OWNER" }, next: "MEMBER" }).ok).toBe(false);
  });

  it("stops an Executive from making another Executive", () => {
    expect(change({ callerRole: "EXECUTIVE", next: "EXECUTIVE" }).ok).toBe(false);
  });

  it("stops an Executive from demoting another Executive", () => {
    expect(
      change({ callerRole: "EXECUTIVE", target: { id: "t", role: "EXECUTIVE" }, next: "MEMBER" }).ok
    ).toBe(false);
  });

  it("stops a Manager from demoting another Manager", () => {
    expect(
      change({ callerRole: "MANAGER", target: { id: "t", role: "MANAGER" }, next: "MEMBER" }).ok
    ).toBe(false);
  });

  it("keeps Managers off the Free plan", () => {
    expect(change({ limits: { maxManagers: 0, maxExecutives: 0, maxTeamLeads: -1 } }).ok).toBe(false);
  });

  it("keeps Executives off Standard", () => {
    expect(change({ next: "EXECUTIVE", limits: { maxManagers: -1, maxExecutives: 0, maxTeamLeads: -1 } }).ok).toBe(false);
  });

  it("caps Executives on Pro", () => {
    const limits = { maxManagers: -1, maxExecutives: 3, maxTeamLeads: -1 };
    expect(change({ next: "EXECUTIVE", limits, executiveCount: 2 }).ok).toBe(true);
    expect(change({ next: "EXECUTIVE", limits, executiveCount: 3 }).ok).toBe(false);
  });

  it("keeps Team Leads to plans with departments", () => {
    expect(change({ next: "TEAM_LEAD", limits: { maxManagers: -1, maxExecutives: -1, maxTeamLeads: 0 } }).ok).toBe(false);
    expect(change({ next: "TEAM_LEAD" }).ok).toBe(true);
  });

  it("lets a Manager make a Member a Team Lead", () => {
    expect(change({ callerRole: "MANAGER", next: "TEAM_LEAD" }).ok).toBe(true);
  });

  it("refuses a change to the rank they already hold", () => {
    expect(change({ target: { id: "t", role: "MANAGER" } }).ok).toBe(false);
  });
});

describe("checkAdminRankChange", () => {
  const base = {
    target: { id: "t", role: "MEMBER" },
    next: "OWNER" as const,
    limits: OPEN,
    executiveCount: 0,
    ownerCount: 1,
  };

  it("lets Internal Management make anyone an Owner", () => {
    expect(checkAdminRankChange(base)).toEqual({ ok: true });
  });

  it("never removes the only Owner", () => {
    expect(checkAdminRankChange({ ...base, target: { id: "t", role: "OWNER" }, next: "MEMBER" }).ok).toBe(false);
  });

  it("removes an Owner while another stays", () => {
    expect(
      checkAdminRankChange({ ...base, target: { id: "t", role: "OWNER" }, next: "MEMBER", ownerCount: 2 }).ok
    ).toBe(true);
  });

  it("still keeps to the plan", () => {
    expect(
      checkAdminRankChange({ ...base, next: "EXECUTIVE", limits: { maxManagers: -1, maxExecutives: 0, maxTeamLeads: -1 } }).ok
    ).toBe(false);
  });
});
