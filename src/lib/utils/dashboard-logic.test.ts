import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { selectFocusProjects, FOCUS_PROJECT_LIMIT } from "./dashboard-logic";
import { ProjectHealth } from "@/types/dashboard";
import { Task } from "@/types/task";
import { Project } from "@/types/project";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const NOW = new Date("2026-09-06T09:00:00Z");
const at = (iso: string) => Timestamp.fromDate(new Date(iso));

function project(id: string, name = id): Project {
  return {
    id,
    orgId: "org",
    name,
    ownerId: "u1",
    createdAt: at("2026-01-01T00:00:00Z"),
  };
}

function health(id: string): ProjectHealth {
  return {
    project: project(id),
    status: "healthy",
    overduePercent: 0,
    overdueCount: 0,
    blockedCount: 0,
    totalActiveTasks: 1,
    healthScore: 100,
  };
}

let seq = 0;
function task(projectId: string, due: string | null, status: Task["status"] = "todo"): Task {
  seq += 1;
  const stamp = at("2026-01-01T00:00:00Z");
  return {
    id: `t${seq}`,
    orgId: "org",
    projectId,
    title: `task ${seq}`,
    description: "",
    status,
    assignedTo: [],
    createdBy: "u1",
    dueDate: due ? at(due) : null,
    createdAt: stamp,
    updatedAt: stamp,
    lastUpdatedAt: stamp,
    completedAt: status === "done" ? stamp : null,
    isBlocked: false,
  };
}

const idsOf = (result: ProjectHealth[]) => result.map((ph) => ph.project.id);

/* ------------------------------------------------------------------ */

describe("selectFocusProjects", () => {
  it("caps the list at two by default", () => {
    expect(FOCUS_PROJECT_LIMIT).toBe(2);

    const projects = [health("a"), health("b"), health("c"), health("d")];
    const tasks = [
      task("a", "2026-09-10T00:00:00Z"),
      task("b", "2026-09-08T00:00:00Z"),
      task("c", "2026-09-09T00:00:00Z"),
      task("d", "2026-09-07T00:00:00Z"),
    ];

    expect(idsOf(selectFocusProjects(projects, tasks))).toEqual(["d", "b"]);
  });

  it("puts overdue projects ahead of upcoming ones", () => {
    const projects = [health("upcoming"), health("overdue")];
    const tasks = [
      task("upcoming", "2026-09-20T00:00:00Z"),
      task("overdue", "2026-08-30T00:00:00Z"), // before NOW
    ];

    expect(idsOf(selectFocusProjects(projects, tasks))).toEqual(["overdue", "upcoming"]);
  });

  it("ranks a project by its earliest unfinished task, not its latest", () => {
    const projects = [health("a"), health("b")];
    const tasks = [
      task("a", "2026-09-30T00:00:00Z"),
      task("a", "2026-09-07T00:00:00Z"), // a's real deadline
      task("b", "2026-09-15T00:00:00Z"),
    ];

    expect(idsOf(selectFocusProjects(projects, tasks))).toEqual(["a", "b"]);
  });

  it("excludes projects whose only dated work is already done", () => {
    const projects = [health("finished"), health("live")];
    const tasks = [
      task("finished", "2026-09-01T00:00:00Z", "done"),
      task("live", "2026-09-25T00:00:00Z"),
    ];

    expect(idsOf(selectFocusProjects(projects, tasks))).toEqual(["live"]);
  });

  it("excludes projects with no due dates rather than padding the list", () => {
    const projects = [health("dated"), health("undated")];
    const tasks = [task("dated", "2026-09-11T00:00:00Z"), task("undated", null)];

    // Only one qualifies, so only one is returned — the empty slot is not
    // filled with the undated project.
    expect(idsOf(selectFocusProjects(projects, tasks))).toEqual(["dated"]);
  });

  it("returns nothing when no task anywhere carries a due date", () => {
    const projects = [health("a"), health("b")];
    const tasks = [task("a", null), task("b", null)];

    expect(selectFocusProjects(projects, tasks)).toEqual([]);
  });

  it("returns nothing when there are no tasks at all", () => {
    expect(selectFocusProjects([health("a")], [])).toEqual([]);
  });

  it("ignores tasks belonging to projects not in the list", () => {
    const tasks = [task("archived", "2026-09-02T00:00:00Z"), task("a", "2026-09-12T00:00:00Z")];

    expect(idsOf(selectFocusProjects([health("a")], tasks))).toEqual(["a"]);
  });

  it("keeps the incoming order when two projects share a deadline", () => {
    const projects = [health("first"), health("second")];
    const tasks = [
      task("second", "2026-09-14T00:00:00Z"),
      task("first", "2026-09-14T00:00:00Z"),
    ];

    // `projectsHealth` arrives in the workspace's priority order, and a tie
    // must not reshuffle it between refreshes.
    expect(idsOf(selectFocusProjects(projects, tasks))).toEqual(["first", "second"]);
  });

  it("honours an explicit limit", () => {
    const projects = [health("a"), health("b"), health("c")];
    const tasks = [
      task("a", "2026-09-07T00:00:00Z"),
      task("b", "2026-09-08T00:00:00Z"),
      task("c", "2026-09-09T00:00:00Z"),
    ];

    expect(idsOf(selectFocusProjects(projects, tasks, 1))).toEqual(["a"]);
    expect(idsOf(selectFocusProjects(projects, tasks, 0))).toEqual([]);
  });

  it("does not mutate the array it is given", () => {
    const projects = [health("late"), health("early")];
    const tasks = [
      task("late", "2026-09-20T00:00:00Z"),
      task("early", "2026-09-07T00:00:00Z"),
    ];

    selectFocusProjects(projects, tasks);
    expect(idsOf(projects)).toEqual(["late", "early"]);
  });

  it("treats NOW as irrelevant — ranking is purely by due date order", () => {
    // Sanity anchor for the fixtures above: the rule needs no clock, which
    // is why there is no fake-timer setup in this suite.
    const projects = [health("a"), health("b")];
    const tasks = [
      task("a", "2020-01-01T00:00:00Z"),
      task("b", "2030-01-01T00:00:00Z"),
    ];
    expect(NOW).toBeInstanceOf(Date);
    expect(idsOf(selectFocusProjects(projects, tasks))).toEqual(["a", "b"]);
  });
});
