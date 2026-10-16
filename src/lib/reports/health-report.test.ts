import { describe, expect, it } from "vitest";

import {
  buildHealthReport,
  isQuietMonth,
  monthBounds,
  previousMonthKey,
  type ReportTask,
} from "./health-report";

/* ------------------------------------------------------------------ */
/*  Monthly health report numbers                                      */
/*                                                                     */
/*  The questions worth pinning are the boundary ones: which month a   */
/*  task lands in when it was finished near midnight SAST, what counts */
/*  as on time, and what an archived project contributes (nothing).    */
/* ------------------------------------------------------------------ */

/** Millis for a SAST wall-clock time. */
const sast = (iso: string) => new Date(`${iso}+02:00`).getTime();

function task(overrides: Partial<ReportTask> = {}): ReportTask {
  return {
    projectId: "p1",
    status: "todo",
    assignedTo: [],
    createdAtMs: sast("2026-08-01T10:00:00"),
    completedAtMs: null,
    dueDateKey: null,
    isBlocked: false,
    ...overrides,
  };
}

const projects = [
  { id: "p1", name: "Brand refresh", archived: false },
  { id: "p2", name: "Website", archived: false },
  { id: "old", name: "Old pitch", archived: true },
];

const people = [
  { uid: "ana", name: "Ana" },
  { uid: "ben", name: "Ben" },
  { uid: "cai", name: "Cai" },
  { uid: "dee", name: "Dee" },
];

const build = (tasks: ReportTask[]) =>
  buildHealthReport({ monthKey: "2026-09", tasks, projects, people });

describe("previousMonthKey", () => {
  it("is the month before, read in SAST", () => {
    expect(previousMonthKey(new Date("2026-10-01T05:00:00Z"))).toBe("2026-09");
  });

  it("wraps January back to December", () => {
    expect(previousMonthKey(new Date("2027-01-01T05:00:00Z"))).toBe("2026-12");
  });

  it("uses the SAST day, not the UTC one", () => {
    // 23:30 UTC on 30 September is already 1 October in Johannesburg.
    expect(previousMonthKey(new Date("2026-09-30T23:30:00Z"))).toBe("2026-09");
  });
});

describe("monthBounds", () => {
  it("runs from SAST midnight on the 1st to SAST midnight on the next 1st", () => {
    const { start, end } = monthBounds("2026-09");
    expect(new Date(start).toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(new Date(end).toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });
});

describe("buildHealthReport", () => {
  it("counts work finished inside the SAST month only", () => {
    const report = build([
      task({ status: "done", completedAtMs: sast("2026-09-01T00:05:00") }),
      task({ status: "done", completedAtMs: sast("2026-09-30T23:55:00") }),
      task({ status: "done", completedAtMs: sast("2026-10-01T00:05:00") }),
      task({ status: "done", completedAtMs: sast("2026-08-31T23:55:00") }),
    ]);
    expect(report.completed).toBe(2);
    expect(report.completedPrevious).toBe(1);
  });

  it("calls a task on time when it was finished on its due day", () => {
    const report = build([
      task({ dueDateKey: "2026-09-10", status: "done", completedAtMs: sast("2026-09-10T22:00:00") }),
      task({ dueDateKey: "2026-09-10", status: "done", completedAtMs: sast("2026-09-11T08:00:00") }),
      task({ dueDateKey: "2026-09-20" }),
    ]);
    expect(report.dueInMonth).toBe(3);
    expect(report.dueOnTime).toBe(1);
    expect(report.missed).toBe(2);
  });

  it("counts as overdue anything still open at month end, even if done since", () => {
    const report = build([
      task({ dueDateKey: "2026-09-25" }),
      task({ dueDateKey: "2026-08-15", status: "doing" }),
      task({ dueDateKey: "2026-09-25", status: "done", completedAtMs: sast("2026-10-02T09:00:00") }),
      task({ dueDateKey: "2026-09-25", status: "done", completedAtMs: sast("2026-09-24T09:00:00") }),
      task({ dueDateKey: "2026-10-05" }),
    ]);
    expect(report.openOverdue).toBe(3);
  });

  it("leaves archived projects out of every number", () => {
    const report = build([
      task({ projectId: "old", status: "done", completedAtMs: sast("2026-09-05T09:00:00") }),
      task({ projectId: "old", dueDateKey: "2026-09-05" }),
    ]);
    expect(report.completed).toBe(0);
    expect(report.dueInMonth).toBe(0);
    expect(report.projects).toEqual([]);
    expect(isQuietMonth(report)).toBe(true);
  });

  it("credits shared work to each assignee and keeps the top three", () => {
    const done = (assignedTo: string[]) =>
      task({ status: "done", assignedTo, completedAtMs: sast("2026-09-15T09:00:00") });
    const report = build([
      done(["ana", "ben"]),
      done(["ana"]),
      done(["ben"]),
      done(["cai"]),
      done(["dee"]),
      done(["dee"]),
      done(["dee"]),
      done(["ghost"]),
    ]);
    expect(report.topContributors).toEqual([
      { uid: "dee", name: "Dee", completed: 3 },
      { uid: "ana", name: "Ana", completed: 2 },
      { uid: "ben", name: "Ben", completed: 2 },
    ]);
  });

  it("lists the projects that slipped first", () => {
    const report = build([
      task({ projectId: "p1", status: "done", completedAtMs: sast("2026-09-02T09:00:00") }),
      task({ projectId: "p1", status: "done", completedAtMs: sast("2026-09-03T09:00:00") }),
      task({ projectId: "p2", dueDateKey: "2026-09-12" }),
    ]);
    expect(report.projects.map((line) => [line.name, line.completed, line.missed])).toEqual([
      ["Website", 0, 1],
      ["Brand refresh", 2, 0],
    ]);
    expect(report.projects[1]).toMatchObject({ score: 100, verdict: "Healthy" });
  });

  it("counts open blocked work and tasks created in the month", () => {
    const report = build([
      task({ isBlocked: true }),
      task({ isBlocked: true, status: "done", completedAtMs: sast("2026-09-02T09:00:00") }),
      task({ createdAtMs: sast("2026-09-10T09:00:00") }),
    ]);
    expect(report.blockedNow).toBe(1);
    expect(report.created).toBe(1);
  });
});
