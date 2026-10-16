import { describe, expect, it } from "vitest";

import {
  checkConnection,
  departmentAbove,
  descendantsOf,
  liveParents,
  parseNodeId,
  peopleAbove,
  readPosition,
  wouldLoop,
  type ChartNodeKind,
} from "./org-chart";

/*
 *   p:owner ── p:exec ── d:eng ── p:mgr ── p:lead ── p:mo
 *                                       └─ p:solo (member straight under the Manager)
 *   p:owner ── d:ops   (no Executive)
 */
const parents = {
  "p:exec": "p:owner",
  "d:eng": "p:exec",
  "p:mgr": "d:eng",
  "p:lead": "p:mgr",
  "p:mo": "p:lead",
  "p:solo": "p:mgr",
  "d:ops": "p:owner",
};

describe("checkConnection", () => {
  const ok = (parent: ChartNodeKind, child: ChartNodeKind) => checkConnection(parent, child).ok;

  it("follows the ladder, skipping a missing Executive or Team Lead", () => {
    expect(ok("OWNER", "EXECUTIVE")).toBe(true);
    expect(ok("EXECUTIVE", "DEPARTMENT")).toBe(true);
    expect(ok("OWNER", "DEPARTMENT")).toBe(true);
    expect(ok("DEPARTMENT", "MANAGER")).toBe(true);
    expect(ok("MANAGER", "TEAM_LEAD")).toBe(true);
    expect(ok("TEAM_LEAD", "MEMBER")).toBe(true);
    expect(ok("MANAGER", "MEMBER")).toBe(true);
  });

  it("refuses wires that skip a department or run upward", () => {
    expect(ok("EXECUTIVE", "MANAGER")).toBe(false);
    expect(ok("DEPARTMENT", "MEMBER")).toBe(false);
    expect(ok("MEMBER", "TEAM_LEAD")).toBe(false);
    expect(ok("EXECUTIVE", "OWNER")).toBe(false);
  });

  it("says where a card belongs", () => {
    expect(checkConnection("EXECUTIVE", "MANAGER")).toEqual({ ok: false, error: "A Manager goes under a department." });
  });
});

describe("liveParents", () => {
  it("drops wires a rank change turned the wrong way", () => {
    const kinds = new Map<string, ChartNodeKind>([
      ["p:owner", "OWNER"],
      ["d:eng", "DEPARTMENT"],
      ["p:mgr", "MEMBER"],
    ]);
    expect(liveParents({ "d:eng": "p:owner", "p:mgr": "d:eng", "p:gone": "p:owner" }, kinds)).toEqual({ "d:eng": "p:owner" });
  });
});

describe("walking the wires", () => {
  it("finds the department above anyone in it", () => {
    expect(departmentAbove("p:mo", parents)).toBe("eng");
    expect(departmentAbove("p:solo", parents)).toBe("eng");
    expect(departmentAbove("p:exec", parents)).toBeNull();
  });

  it("lists everyone under a card", () => {
    expect(descendantsOf("p:mgr", parents).sort()).toEqual(["p:lead", "p:mo", "p:solo"]);
  });

  it("lists the people above, passing through the department", () => {
    expect(peopleAbove("p:mo", parents)).toEqual(["lead", "mgr", "exec", "owner"]);
  });

  it("spots a loop", () => {
    expect(wouldLoop("p:mgr", "p:mo", parents)).toBe(true);
    expect(wouldLoop("p:mo", "p:solo", parents)).toBe(false);
  });
});

describe("parseNodeId and readPosition", () => {
  it("reads only well-formed ids and sane positions", () => {
    expect(parseNodeId("p:abc")).toEqual({ kind: "person", ref: "abc" });
    expect(parseNodeId("x:abc")).toBeNull();
    expect(readPosition({ x: 1.4, y: 2.6 })).toEqual({ x: 1, y: 3 });
    expect(readPosition({ x: Infinity, y: 0 })).toBeNull();
  });
});
