import { describe, expect, it } from "vitest";

import { standingOf } from "./standing";

const chart = {
  people: [{ id: "own" }, { id: "mgr" }, { id: "lead" }, { id: "ana" }, { id: "sam" }],
  departments: [{ id: "eng" }],
  parents: {
    "d:eng": "p:own",
    "p:mgr": "d:eng",
    "p:lead": "p:mgr",
    "p:ana": "p:lead",
    "p:sam": "p:lead",
  },
};

describe("standingOf", () => {
  it("climbs the whole reporting line, through the department", () => {
    expect(standingOf("ana", chart).reportsTo.map((p) => p.id)).toEqual(["lead", "mgr", "own"]);
  });

  it("names the department they sit in and its head", () => {
    const { department } = standingOf("ana", chart);
    expect(department?.department.id).toBe("eng");
    expect(department?.head?.id).toBe("own");
  });

  it("draws the whole line above, departments included, top first", () => {
    const line = standingOf("ana", chart).line.map((s) => (s.kind === "person" ? s.person.id : `d:${s.department.id}`));
    expect(line).toEqual(["own", "d:eng", "mgr", "lead"]);
  });

  it("counts people under a department someone heads as their reports", () => {
    const owner = standingOf("own", chart);
    expect(owner.reports).toEqual([{ department: { id: "eng" }, people: [{ id: "mgr" }] }]);
    expect(owner.directReports.map((p) => p.id)).toEqual(["mgr"]);
  });

  it("lists the departments someone heads", () => {
    expect(standingOf("own", chart).heads.map((d) => d.id)).toEqual(["eng"]);
    expect(standingOf("own", chart).department).toBeNull();
  });

  it("counts direct reports and everyone under", () => {
    const lead = standingOf("lead", chart);
    expect(lead.directReports.map((p) => p.id)).toEqual(["ana", "sam"]);
    expect(standingOf("own", chart).teamSize).toBe(4);
  });

  it("knows who isn't on the chart", () => {
    expect(standingOf("nobody", chart).onChart).toBe(false);
    expect(standingOf("ana", chart).onChart).toBe(true);
  });
});
