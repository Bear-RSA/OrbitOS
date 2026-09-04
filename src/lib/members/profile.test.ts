import { describe, expect, it } from "vitest";
import { MAX_SYSTEM_LOAD, sharedEngagements, workloadFor } from "@/lib/members/profile";
import type { OrbitEvent } from "@/types/event";
import type { Task } from "@/types/task";

/* ------------------------------------------------------------------ */
/*  Member profile facts                                               */
/*                                                                     */
/*  These numbers appear on a card about a colleague, so what matters  */
/*  is that they never overstate: a cancelled meeting is not a meeting */
/*  you had, and a finished task is not work still on someone's plate. */
/* ------------------------------------------------------------------ */

const SARAH = "uidSarah";
const MARCUS = "uidMarcus";

const task = (over: Partial<Task> = {}): Task =>
  ({ status: "todo", assignedTo: [SARAH], ...over }) as Task;

const stamp = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });

const event = (over: Partial<OrbitEvent> = {}): OrbitEvent =>
  ({
    id: "e1",
    title: "Standup",
    status: "confirmed",
    attendees: [SARAH, MARCUS],
    startAt: stamp(1_000),
    ...over,
  }) as unknown as OrbitEvent;

describe("workload", () => {
  it("counts only this person's open directives", () => {
    const tasks = [
      task(),
      task({ assignedTo: [MARCUS] }),
      task({ status: "done" }),
      task({ assignedTo: [SARAH, MARCUS] }),
    ];
    expect(workloadFor(tasks, SARAH).open).toBe(2);
    expect(workloadFor(tasks, MARCUS).open).toBe(2);
  });

  it("reads a full plate as 100 percent", () => {
    const tasks = Array.from({ length: MAX_SYSTEM_LOAD }, () => task());
    expect(workloadFor(tasks, SARAH).loadPercent).toBe(100);
  });

  it("clamps rather than reporting over 100", () => {
    const tasks = Array.from({ length: MAX_SYSTEM_LOAD * 3 }, () => task());
    expect(workloadFor(tasks, SARAH).loadPercent).toBe(100);
  });

  it("is quiet for someone with nothing assigned", () => {
    expect(workloadFor([], SARAH)).toEqual({ open: 0, loadPercent: 0 });
  });

  it("survives a task with no assignees", () => {
    expect(workloadFor([task({ assignedTo: undefined })], SARAH).open).toBe(0);
  });
});

describe("shared engagements", () => {
  it("keeps only the ones both people were on", () => {
    const events = [
      event({ id: "both" }),
      event({ id: "sarah-only", attendees: [SARAH] }),
      event({ id: "neither", attendees: ["uidOther"] }),
    ];
    expect(sharedEngagements(events, SARAH, MARCUS).map((e) => e.id)).toEqual(["both"]);
  });

  it("drops cancelled ones — a called-off meeting is not a meeting you had", () => {
    const events = [event({ id: "off", status: "cancelled" })];
    expect(sharedEngagements(events, SARAH, MARCUS)).toEqual([]);
  });

  it("returns the most recent first", () => {
    const events = [
      event({ id: "old", startAt: stamp(1_000) as never }),
      event({ id: "new", startAt: stamp(9_000) as never }),
    ];
    expect(sharedEngagements(events, SARAH, MARCUS).map((e) => e.id)).toEqual([
      "new",
      "old",
    ]);
  });

  it("caps the list", () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      event({ id: `e${i}`, startAt: stamp(i * 1_000) as never })
    );
    expect(sharedEngagements(events, SARAH, MARCUS, 3)).toHaveLength(3);
  });

  it("shows nothing for your own card", () => {
    expect(sharedEngagements([event()], SARAH, SARAH)).toEqual([]);
  });
});
