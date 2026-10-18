import { describe, expect, it } from "vitest";

import {
  MAX_BRIEF_LINES,
  buildAttention,
  buildMyWeek,
  shiftDayKey,
  type BriefTask,
} from "./briefs";

/* ------------------------------------------------------------------ */
/*  On-demand briefs                                                   */
/*                                                                     */
/*  The boundaries worth pinning: a task due today is due, not late;   */
/*  the week is seven days including today; done work never shows as  */
/*  a problem; archived projects contribute nothing.                   */
/* ------------------------------------------------------------------ */

const TODAY = "2026-10-20";
const NOW = Date.parse("2026-10-20T08:00:00Z");
const DAY = 86_400_000;

const projects = new Map([["p1", "Website"]]);
const people = new Map([["u1", "Thandi"], ["u2", "Sipho"]]);

function task(overrides: Partial<BriefTask> = {}): BriefTask {
  return {
    id: "t1",
    title: "Task",
    projectId: "p1",
    status: "todo",
    assignedTo: ["u1"],
    dueDateKey: null,
    isBlocked: false,
    blockedReason: null,
    completedAtMs: null,
    lastUpdatedMs: NOW,
    ...overrides,
  };
}

describe("shiftDayKey", () => {
  it("crosses month and year ends", () => {
    expect(shiftDayKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("my week", () => {
  const week = (tasks: BriefTask[], meetings = [] as Parameters<typeof buildMyWeek>[0]["meetings"]) =>
    buildMyWeek({ todayKey: TODAY, nowMs: NOW, tasks, meetings, projects, people });

  it("counts a task due today as due, not overdue", () => {
    const brief = week([task({ dueDateKey: TODAY })]);
    expect(brief.overdue.total).toBe(0);
    expect(brief.dueThisWeek.total).toBe(1);
  });

  it("reports how many days late an overdue task is", () => {
    const brief = week([task({ dueDateKey: "2026-10-17" })]);
    expect(brief.overdue.tasks[0].daysOverdue).toBe(3);
  });

  it("covers seven days including today, and no more", () => {
    const brief = week([
      task({ id: "a", dueDateKey: "2026-10-26" }),
      task({ id: "b", dueDateKey: "2026-10-27" }),
    ]);
    expect(brief.through).toBe("2026-10-26");
    expect(brief.dueThisWeek.tasks.map((t) => t.id)).toEqual(["a"]);
  });

  it("never lists finished work as late or blocked", () => {
    const brief = week([
      task({ status: "done", dueDateKey: "2026-10-01", isBlocked: true, completedAtMs: NOW - DAY }),
    ]);
    expect(brief.overdue.total).toBe(0);
    expect(brief.blocked.total).toBe(0);
    expect(brief.completedLast7Days).toBe(1);
  });

  it("names people and projects instead of ids", () => {
    const line = week([task({ dueDateKey: TODAY, assignedTo: ["u1", "u2"] })]).dueThisWeek.tasks[0];
    expect(line.project).toBe("Website");
    expect(line.assignees).toEqual(["Thandi", "Sipho"]);
  });

  it("lists only meetings that have not ended and start within the week", () => {
    const brief = week([], [
      { id: "past", title: "Past", startMs: NOW - 2 * DAY, endMs: NOW - DAY, meetingUrl: null },
      { id: "now", title: "Now", startMs: NOW - 1000, endMs: NOW + 1000, meetingUrl: null },
      { id: "far", title: "Far", startMs: NOW + 8 * DAY, endMs: NOW + 8 * DAY + 1000, meetingUrl: null },
    ]);
    expect(brief.meetings.map((m) => m.id)).toEqual(["now"]);
  });

  it("caps the lines but keeps the true total", () => {
    const many = Array.from({ length: MAX_BRIEF_LINES + 5 }, (_, i) =>
      task({ id: `t${i}`, dueDateKey: TODAY })
    );
    const brief = week(many);
    expect(brief.dueThisWeek.total).toBe(MAX_BRIEF_LINES + 5);
    expect(brief.dueThisWeek.tasks).toHaveLength(MAX_BRIEF_LINES);
  });
});

describe("attention", () => {
  const attention = (tasks: BriefTask[]) =>
    buildAttention({ todayKey: TODAY, nowMs: NOW, tasks, projects, people });

  it("puts the most overdue first", () => {
    const brief = attention([
      task({ id: "a", dueDateKey: "2026-10-19" }),
      task({ id: "b", dueDateKey: "2026-10-10" }),
    ]);
    expect(brief.overdue.tasks.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("finds unassigned open work", () => {
    expect(attention([task({ assignedTo: [] })]).unassigned.total).toBe(1);
  });

  it("calls in-progress work stalled only after the idle threshold", () => {
    const brief = attention([
      task({ id: "fresh", status: "doing", lastUpdatedMs: NOW - DAY }),
      task({ id: "stale", status: "doing", lastUpdatedMs: NOW - 5 * DAY }),
      task({ id: "todo", status: "todo", lastUpdatedMs: NOW - 5 * DAY }),
    ]);
    expect(brief.stalled.tasks.map((t) => t.id)).toEqual(["stale"]);
    expect(brief.stalled.tasks[0].daysIdle).toBe(5);
  });

  it("ignores tasks in projects it was not given, such as archived ones", () => {
    const brief = attention([task({ projectId: "archived", assignedTo: [] })]);
    expect(brief.unassigned.total).toBe(0);
  });
});
