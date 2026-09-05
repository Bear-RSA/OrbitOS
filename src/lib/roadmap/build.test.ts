import { describe, expect, it } from "vitest";
import { Task } from "@/types/task";
import { buildRoadmap, dayIndex, shiftKey, UNGROUPED_LANE } from "./build";

/* ------------------------------------------------------------------ */
/*  Roadmap model                                                      */
/*                                                                     */
/*  The run pins TZ to Africa/Johannesburg (see vitest.config.mts), so */
/*  a local-midnight instant and its date key agree here the way they  */
/*  do on an operator's machine.                                       */
/* ------------------------------------------------------------------ */

const TODAY = "2026-09-05";

/** A Firestore Timestamp as far as this module is concerned. */
function stamp(key: string, hour = 9) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d, hour, 0, 0, 0);
  return { toDate: () => date } as unknown as Task["createdAt"];
}

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    orgId: "org",
    projectId: "proj",
    title: "Directive",
    description: "",
    status: "todo",
    assignedTo: [],
    milestone: null,
    createdBy: "u1",
    dueDate: null,
    dueDateKey: null,
    createdAt: stamp(TODAY),
    updatedAt: stamp(TODAY),
    lastUpdatedAt: stamp(TODAY),
    completedAt: null,
    isBlocked: false,
    ...overrides,
  } as Task;
}

describe("day arithmetic", () => {
  it("counts whole days between keys in both directions", () => {
    expect(dayIndex("2026-09-01", "2026-09-08")).toBe(7);
    expect(dayIndex("2026-09-08", "2026-09-01")).toBe(-7);
    expect(dayIndex("2026-09-05", "2026-09-05")).toBe(0);
  });

  it("crosses month and year boundaries", () => {
    expect(dayIndex("2026-01-30", "2026-02-02")).toBe(3);
    expect(dayIndex("2026-12-30", "2027-01-02")).toBe(3);
    expect(shiftKey("2026-02-27", 2)).toBe("2026-03-01");
    expect(shiftKey("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("buildRoadmap", () => {
  it("groups bars into milestone lanes, earliest first, catch-all last", () => {
    const model = buildRoadmap(
      [
        task({ id: "a", milestone: "Launch", createdAt: stamp("2026-09-10"), dueDateKey: "2026-09-20" }),
        task({ id: "b", milestone: "Foundations", createdAt: stamp("2026-09-01"), dueDateKey: "2026-09-06" }),
        task({ id: "c", milestone: null, createdAt: stamp("2026-08-20"), dueDateKey: "2026-08-28" }),
      ],
      TODAY
    );

    expect(model.lanes.map((l) => l.milestone)).toEqual([
      "Foundations",
      "Launch",
      UNGROUPED_LANE,
    ]);
  });

  it("spans a lane from its earliest start to its latest end", () => {
    const model = buildRoadmap(
      [
        task({ id: "a", milestone: "Launch", createdAt: stamp("2026-09-10"), dueDateKey: "2026-09-14" }),
        task({ id: "b", milestone: "Launch", createdAt: stamp("2026-09-02"), dueDateKey: "2026-09-30" }),
      ],
      TODAY
    );

    const [lane] = model.lanes;
    expect(lane.startKey).toBe("2026-09-02");
    expect(lane.endKey).toBe("2026-09-30");
    expect(lane.bars.map((b) => b.taskId)).toEqual(["b", "a"]);
  });

  it("reads the horizon from dueDateKey, not the sort Timestamp", () => {
    // Midday UTC is the 15th everywhere from UTC-11 to UTC+11, but the
    // key is what the author picked and the bar has to honour it.
    const model = buildRoadmap(
      [
        task({
          id: "a",
          createdAt: stamp("2026-09-01"),
          dueDateKey: "2026-09-15",
          dueDate: stamp("2026-09-30") as unknown as Task["dueDate"],
        }),
      ],
      TODAY
    );

    expect(model.lanes[0].bars[0].endKey).toBe("2026-09-15");
  });

  it("falls back to the Timestamp for rows written before dueDateKey existed", () => {
    const legacy = task({ id: "a", createdAt: stamp("2026-09-01") });
    legacy.dueDateKey = undefined;
    legacy.dueDate = { toDate: () => new Date(Date.UTC(2026, 8, 15, 0, 0, 0)) } as Task["dueDate"];

    const model = buildRoadmap([legacy], TODAY);
    expect(model.lanes[0].bars[0].dueKey).toBe("2026-09-15");
  });

  it("keeps horizon-less tasks off the timeline instead of inventing one", () => {
    const model = buildRoadmap(
      [task({ id: "a", milestone: "Launch", createdAt: stamp("2026-09-01") })],
      TODAY
    );

    expect(model.lanes).toHaveLength(0);
    expect(model.unscheduled.map((b) => b.taskId)).toEqual(["a"]);
    expect(model.unscheduled[0].scheduled).toBe(false);
  });

  it("resolves state in priority order", () => {
    const model = buildRoadmap(
      [
        task({ id: "done", status: "done", dueDateKey: "2026-08-01", completedAt: stamp("2026-08-03") }),
        task({ id: "blocked", isBlocked: true, dueDateKey: "2026-08-01" }),
        task({ id: "overdue", dueDateKey: "2026-09-04" }),
        task({ id: "active", status: "doing", dueDateKey: "2026-09-20" }),
        task({ id: "planned", dueDateKey: "2026-09-20" }),
      ],
      TODAY
    );

    const byId = new Map(model.lanes[0].bars.map((b) => [b.taskId, b.state]));
    expect(byId.get("done")).toBe("done");
    expect(byId.get("blocked")).toBe("blocked");
    expect(byId.get("overdue")).toBe("overdue");
    expect(byId.get("active")).toBe("active");
    expect(byId.get("planned")).toBe("planned");
  });

  it("does not call work overdue on its own due day", () => {
    const model = buildRoadmap([task({ id: "a", dueDateKey: TODAY })], TODAY);
    expect(model.lanes[0].bars[0].state).toBe("planned");
  });

  it("ends a finished bar on the day it was delivered and measures the slip", () => {
    const model = buildRoadmap(
      [
        task({
          id: "a",
          status: "done",
          createdAt: stamp("2026-09-01"),
          dueDateKey: "2026-09-10",
          completedAt: stamp("2026-09-13"),
        }),
      ],
      TODAY
    );

    const [bar] = model.lanes[0].bars;
    expect(bar.endKey).toBe("2026-09-13");
    expect(bar.slipDays).toBe(3);
  });

  it("reports no slip for work delivered early", () => {
    const model = buildRoadmap(
      [
        task({
          id: "a",
          status: "done",
          createdAt: stamp("2026-09-01"),
          dueDateKey: "2026-09-10",
          completedAt: stamp("2026-09-08"),
        }),
      ],
      TODAY
    );

    expect(model.lanes[0].bars[0].slipDays).toBe(0);
    expect(model.lanes[0].bars[0].endKey).toBe("2026-09-08");
  });

  it("orders a bar whose horizon precedes its creation", () => {
    const model = buildRoadmap(
      [task({ id: "a", createdAt: stamp("2026-09-10"), dueDateKey: "2026-09-02" })],
      TODAY
    );

    const [bar] = model.lanes[0].bars;
    expect(bar.startKey).toBe("2026-09-02");
    expect(bar.endKey).toBe("2026-09-10");
  });

  it("counts milestone progress over every task, filtered or not", () => {
    const tasks = [
      task({ id: "a", milestone: "Launch", status: "done", dueDateKey: "2026-09-01", completedAt: stamp("2026-09-01") }),
      task({ id: "b", milestone: "Launch", dueDateKey: "2026-09-20" }),
      task({ id: "c", milestone: "Launch" }),
    ];

    const hidden = buildRoadmap(tasks, TODAY, { includeDone: false });
    expect(hidden.lanes[0].bars.map((b) => b.taskId)).toEqual(["b"]);
    expect(hidden.lanes[0].doneCount).toBe(1);
    expect(hidden.lanes[0].totalCount).toBe(3);
    expect(hidden.lanes[0].unscheduledCount).toBe(1);
  });

  it("holds the window steady when completed work is hidden", () => {
    // The earliest and latest directives are both done, so a window
    // built from the filtered set alone would shrink on both sides and
    // drag every surviving bar across the screen.
    const tasks = [
      task({ id: "first", status: "done", createdAt: stamp("2026-06-01"), dueDateKey: "2026-06-10", completedAt: stamp("2026-06-09") }),
      task({ id: "middle", createdAt: stamp("2026-08-01"), dueDateKey: "2026-09-20" }),
      task({ id: "last", status: "done", createdAt: stamp("2026-08-01"), dueDateKey: "2026-11-30", completedAt: stamp("2026-11-28") }),
    ];

    const all = buildRoadmap(tasks, TODAY);
    const hidden = buildRoadmap(tasks, TODAY, { includeDone: false });

    expect(hidden.startKey).toBe(all.startKey);
    expect(hidden.endKey).toBe(all.endKey);
    expect(hidden.totalDays).toBe(all.totalDays);
    expect(hidden.lanes[0].bars.map((b) => b.taskId)).toEqual(["middle"]);
  });

  it("keeps today inside the window when all work is in the past", () => {
    const model = buildRoadmap(
      [task({ id: "a", createdAt: stamp("2026-01-01"), dueDateKey: "2026-01-31" })],
      TODAY
    );

    expect(model.startKey < "2026-01-01").toBe(true);
    expect(model.endKey > TODAY).toBe(true);
    expect(model.totalDays).toBe(dayIndex(model.startKey, model.endKey) + 1);
  });

  it("still spans a window with no tasks at all", () => {
    const model = buildRoadmap([], TODAY);
    expect(model.lanes).toHaveLength(0);
    expect(model.startKey).toBe("2026-09-02");
    expect(model.endKey).toBe("2026-09-08");
    expect(model.totalDays).toBe(7);
  });
});
