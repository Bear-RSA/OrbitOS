import { describe, expect, it } from "vitest";

import { buildWiredTree } from "./wired-tree";

const people = [
  { id: "own", name: "Thandi", role: "OWNER" },
  { id: "own2", name: "Sipho", role: "OWNER" },
  { id: "exe", name: "Nomsa", role: "EXECUTIVE" },
  { id: "mgr", name: "Lebo", role: "MANAGER" },
  { id: "led", name: "Kim", role: "TEAM_LEAD" },
  { id: "m1", name: "Ana", role: "MEMBER" },
  { id: "m2", name: "Sam", role: "MEMBER" },
  { id: "old", name: "Zola", role: "MEMBER", departmentId: "ops" },
  { id: "lost", name: "Bo", role: "MEMBER" },
];
const departments = [
  { id: "eng", name: "Engineering" },
  { id: "ops", name: "Operations" },
  { id: "new", name: "Brand new" },
];
const parents = {
  "p:exe": "p:own",
  "d:eng": "p:exe",
  "p:mgr": "d:eng",
  "p:led": "p:mgr",
  "p:m1": "p:led",
  "p:m2": "p:mgr",
  "d:ops": "p:own2",
};

const tree = buildWiredTree(people, departments, parents);
const column = (id: string) => tree.departments.find((d) => d.department.id === id)!;

describe("buildWiredTree", () => {
  it("puts Owners in the top row and Executives under theirs", () => {
    expect(tree.owners.map((o) => o.id).sort()).toEqual(["own", "own2"]);
    expect(tree.executives).toEqual([{ person: people[2], ownerId: "own" }]);
  });

  it("hangs each department from its card", () => {
    expect(column("eng").bossId).toBe("exe");
    expect(column("ops").bossId).toBe("own2");
    expect(column("new").bossId).toBeNull();
  });

  it("nests Manager, Team Lead and Members inside the department", () => {
    const [manager] = column("eng").managers;
    expect(manager.manager.id).toBe("mgr");
    expect(manager.leads.map((l) => [l.lead.id, l.members.map((m) => m.id)])).toEqual([["led", ["m1"]]]);
    expect(manager.members.map((m) => m.id)).toEqual(["m2"]);
    expect(column("eng").count).toBe(4);
  });

  it("keeps people filed before the chart in their department", () => {
    expect(column("ops").filed.map((p) => p.id)).toEqual(["old"]);
  });

  it("puts anyone placed nowhere in the bucket", () => {
    expect(tree.unassigned.map((p) => p.id)).toEqual(["lost"]);
  });

  it("lists unwired departments last", () => {
    expect(tree.departments.at(-1)?.department.id).toBe("new");
  });

  it("puts the viewer's own Owner card first when asked", () => {
    expect(buildWiredTree(people, departments, parents, "own2").owners[0].id).toBe("own2");
  });
});
