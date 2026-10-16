import { describe, expect, it } from "vitest";

import {
  canFillSlot,
  checkConnection,
  liveParents,
  parseNodeId,
  personTier,
  readPosition,
  type ChartTier,
} from "./org-chart";

const owner = { kind: "person" as const, tier: 1 as ChartTier };
const dept = { kind: "department" as const, tier: 2 as ChartTier };

describe("personTier", () => {
  it("gives Owners a card", () => {
    expect(personTier("OWNER")).toBe(1);
  });

  it("leaves every other rank to the department slots", () => {
    expect(personTier("EXECUTIVE")).toBeNull();
    expect(personTier("MANAGER")).toBeNull();
    expect(personTier("MEMBER")).toBeNull();
  });
});

describe("canFillSlot", () => {
  it("takes only the slot's own rank", () => {
    expect(canFillSlot("executive", "EXECUTIVE")).toBe(true);
    expect(canFillSlot("manager", "MANAGER")).toBe(true);
    expect(canFillSlot("manager", "EXECUTIVE")).toBe(false);
    expect(canFillSlot("executive", "MEMBER")).toBe(false);
  });
});

describe("checkConnection", () => {
  it("wires an Owner down to a department", () => {
    expect(checkConnection(owner, dept).ok).toBe(true);
  });

  it("refuses sideways and upward wires", () => {
    expect(checkConnection(owner, owner).ok).toBe(false);
    expect(checkConnection(dept, owner).ok).toBe(false);
  });

  it("never puts anything under a department", () => {
    expect(checkConnection(dept, dept).ok).toBe(false);
  });
});

describe("liveParents", () => {
  const tiers = new Map<string, { kind: "person" | "department"; tier: ChartTier }>([
    ["p:o", owner],
    ["d:x", dept],
  ]);

  it("keeps wires that still hold", () => {
    expect(liveParents({ "d:x": "p:o" }, tiers)).toEqual({ "d:x": "p:o" });
  });

  it("drops wires to cards that left the chart", () => {
    expect(liveParents({ "d:x": "p:gone" }, tiers)).toEqual({});
  });

  it("drops wires from cards that no longer have one, like an old Manager card", () => {
    expect(liveParents({ "d:x": "p:manager" }, tiers)).toEqual({});
  });
});

describe("parseNodeId", () => {
  it("reads both kinds", () => {
    expect(parseNodeId("p:abc")).toEqual({ kind: "person", ref: "abc" });
    expect(parseNodeId("d:abc")).toEqual({ kind: "department", ref: "abc" });
  });

  it("refuses anything else", () => {
    expect(parseNodeId("x:abc")).toBeNull();
    expect(parseNodeId("p:")).toBeNull();
    expect(parseNodeId("p:a/b")).toBeNull();
  });
});

describe("readPosition", () => {
  it("keeps finite numbers", () => {
    expect(readPosition({ x: 10.4, y: -3 })).toEqual({ x: 10, y: -3 });
  });

  it("refuses junk", () => {
    expect(readPosition({ x: "1", y: 2 })).toBeNull();
    expect(readPosition({ x: Infinity, y: 2 })).toBeNull();
    expect(readPosition({ x: 1e9, y: 2 })).toBeNull();
  });
});
