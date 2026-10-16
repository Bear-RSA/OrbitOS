import { describe, expect, it } from "vitest";

import {
  buildOrgTree,
  DEFAULT_LEAD_TITLE,
  effectiveDepartmentLimit,
  HARD_MAX_DEPARTMENTS,
  normaliseDepartmentName,
  normaliseLeadTitle,
  resolvePrimaryOwnerId,
  type TreePerson,
} from "@/lib/members/hierarchy";
import type { Department } from "@/types/department";

/* ------------------------------------------------------------------ */
/*  Main owner                                                         */
/* ------------------------------------------------------------------ */

describe("resolvePrimaryOwnerId", () => {
  const owners = [
    { id: "late", createdAtMillis: 9000 },
    { id: "first", createdAtMillis: 1000 },
  ];

  it("trusts the stored owner while they still hold the role", () => {
    expect(resolvePrimaryOwnerId("late", owners)).toBe("late");
  });

  it("falls back to the earliest owner when the stored one was demoted", () => {
    expect(resolvePrimaryOwnerId("gone", owners)).toBe("first");
  });

  it("falls back to the earliest owner when nothing is stored", () => {
    expect(resolvePrimaryOwnerId(undefined, owners)).toBe("first");
  });

  it("has no main owner when there are no owners", () => {
    expect(resolvePrimaryOwnerId("x", [])).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Ownership changes                                                  */
/* ------------------------------------------------------------------ */

describe("normaliseDepartmentName", () => {
  it("trims and collapses whitespace", () => {
    expect(normaliseDepartmentName("  Client   Delivery ")).toEqual({ ok: true, name: "Client Delivery" });
  });

  it("refuses an empty or overlong name", () => {
    expect(normaliseDepartmentName("   ").ok).toBe(false);
    expect(normaliseDepartmentName("x".repeat(61)).ok).toBe(false);
    expect(normaliseDepartmentName(42).ok).toBe(false);
  });
});

describe("normaliseLeadTitle", () => {
  it("keeps a title the department chose", () => {
    expect(normaliseLeadTitle("  Head of   Design ")).toEqual({ ok: true, title: "Head of Design" });
  });

  it("falls back to Lead when left blank", () => {
    expect(normaliseLeadTitle("")).toEqual({ ok: true, title: DEFAULT_LEAD_TITLE });
    expect(normaliseLeadTitle(undefined)).toEqual({ ok: true, title: DEFAULT_LEAD_TITLE });
  });

  it("refuses an overlong title", () => {
    expect(normaliseLeadTitle("x".repeat(41)).ok).toBe(false);
  });
});

describe("effectiveDepartmentLimit", () => {
  it("never lets a tier widen the hard ceiling", () => {
    expect(effectiveDepartmentLimit(-1)).toBe(HARD_MAX_DEPARTMENTS);
    expect(effectiveDepartmentLimit(500)).toBe(HARD_MAX_DEPARTMENTS);
    expect(effectiveDepartmentLimit(10)).toBe(10);
    expect(effectiveDepartmentLimit(0)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  The tree                                                           */
/* ------------------------------------------------------------------ */

function dept(id: string, name: string, leadId: string | null = null): Department {
  return { id, orgId: "org-1", name, leadId, leadTitle: DEFAULT_LEAD_TITLE, createdAt: 0 };
}

function person(id: string, role: "OWNER" | "MEMBER", departmentId?: string | null): TreePerson {
  return { id, name: id, role, departmentId };
}

describe("buildOrgTree", () => {
  it("puts the account holder first in the owner row when they are the viewer", () => {
    const tree = buildOrgTree(
      [person("zoe", "OWNER"), person("bear", "OWNER"), person("amy", "OWNER")],
      [],
      "zoe"
    );
    expect(tree.owners.map((p) => p.id)).toEqual(["zoe", "amy", "bear"]);
  });

  it("orders owners by name alone for everyone else, so the account holder can't be read off it", () => {
    const tree = buildOrgTree(
      [person("zoe", "OWNER"), person("bear", "OWNER"), person("amy", "OWNER")],
      [],
      null
    );
    expect(tree.owners.map((p) => p.id)).toEqual(["amy", "bear", "zoe"]);
  });

  it("files members under their department with the lead split out", () => {
    const tree = buildOrgTree(
      [person("lead", "MEMBER", "d1"), person("bo", "MEMBER", "d1"), person("al", "MEMBER", "d1")],
      [dept("d1", "Design", "lead")],
      null
    );
    expect(tree.departments[0].lead?.id).toBe("lead");
    expect(tree.departments[0].members.map((p) => p.id)).toEqual(["al", "bo"]);
  });

  it("ignores a lead who has since left the department", () => {
    const tree = buildOrgTree([person("x", "MEMBER", "d2")], [dept("d1", "Design", "x"), dept("d2", "Ops")], null);
    expect(tree.departments.find((b) => b.department.id === "d1")?.lead).toBeNull();
  });

  it("treats a deleted department as unassigned", () => {
    const tree = buildOrgTree([person("x", "MEMBER", "gone"), person("y", "MEMBER")], [], null);
    expect(tree.unassigned.map((p) => p.id)).toEqual(["x", "y"]);
  });

  it("never files an owner under a department", () => {
    const tree = buildOrgTree([person("o", "OWNER", "d1")], [dept("d1", "Design", "o")], "o");
    expect(tree.owners.map((p) => p.id)).toEqual(["o"]);
    expect(tree.departments[0].lead).toBeNull();
    expect(tree.departments[0].members).toEqual([]);
  });

  it("sorts departments by name and keeps empty ones", () => {
    const tree = buildOrgTree([], [dept("b", "Ops"), dept("a", "Design")], null);
    expect(tree.departments.map((b) => b.department.name)).toEqual(["Design", "Ops"]);
  });
});
