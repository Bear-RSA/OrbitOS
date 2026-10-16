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

  it("lets a department connect to anyone, both ways", () => {
    for (const kind of ["EXECUTIVE", "MANAGER", "TEAM_LEAD", "MEMBER", "DEPARTMENT"] as const) {
      expect(ok("DEPARTMENT", kind)).toBe(true);
    }
    for (const kind of ["OWNER", "EXECUTIVE", "MANAGER", "TEAM_LEAD", "MEMBER"] as const) {
      expect(ok(kind, "DEPARTMENT")).toBe(true);
    }
  });

  it("lets people report to anyone above them, skipping ranks", () => {
    expect(ok("OWNER", "MEMBER")).toBe(true);
    expect(ok("EXECUTIVE", "MANAGER")).toBe(true);
    expect(ok("MANAGER", "MEMBER")).toBe(true);
  });

  it("refuses reporting sideways or down, and anything above an Owner", () => {
    expect(ok("MEMBER", "TEAM_LEAD")).toBe(false);
    expect(ok("MANAGER", "MANAGER")).toBe(false);
    expect(ok("DEPARTMENT", "OWNER")).toBe(false);
    expect(checkConnection("MEMBER", "MANAGER")).toEqual({ ok: false, error: "People report to someone of a higher rank." });
  });
});
describe("liveParents", () => {
  it("drops wires a rank change turned the wrong way", () => {
    const kinds = new Map<string, ChartNodeKind>([
      ["p:owner", "OWNER"],
      ["d:eng", "DEPARTMENT"],
      ["p:mgr", "MEMBER"],
      ["p:lead", "TEAM_LEAD"],
    ]);
    // The Manager above the Team Lead was moved down to Member.
    expect(liveParents({ "d:eng": "p:owner", "p:lead": "p:mgr", "p:gone": "p:owner" }, kinds)).toEqual({ "d:eng": "p:owner" });
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
