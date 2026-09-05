import { Task } from "@/types/task";
import { dueDateKeyOf, parseDateKey, toDateKey } from "@/lib/utils/dates";

/* ------------------------------------------------------------------ */
/*  Roadmap model                                                      */
/*                                                                     */
/*  The shape the Gantt draws, derived from the same live task list    */
/*  the table below it renders. Kept apart from the component because  */
/*  the interesting decisions here are arithmetic — which day a bar    */
/*  starts on, which lane it belongs to, whether it is late — and      */
/*  those are worth testing without a DOM.                             */
/*                                                                     */
/*  Everything is measured in calendar-day keys ("YYYY-MM-DD"), never  */
/*  in instants. A bar occupies days, and the day a Timestamp falls    */
/*  on depends on who is reading it; `dueDateKey` is the authority.    */
/*  Keys also sort lexicographically, so `a < b` is a date comparison. */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

/** Breathing room drawn either side of the outermost bar. */
const SPAN_PADDING_DAYS = 3;

/** The lane tasks land in when nobody has filed them under a milestone. */
export const UNGROUPED_LANE = "Unassigned";

export type RoadmapState = "done" | "blocked" | "overdue" | "active" | "planned";

export interface RoadmapBar {
  taskId: string;
  title: string;
  milestone: string;
  assignedTo: string[];
  state: RoadmapState;
  /** First day the bar covers, inclusive. */
  startKey: string;
  /** Last day the bar covers, inclusive. */
  endKey: string;
  /** The horizon itself, or null when none was ever set. */
  dueKey: string | null;
  /** False when the task has no horizon, which means it cannot be placed. */
  scheduled: boolean;
  /** Days between the horizon and delivery, for work that landed late. */
  slipDays: number;
}

export interface RoadmapLane {
  milestone: string;
  /** Placeable bars only, in start order. */
  bars: RoadmapBar[];
  /** Span of the lane's bars — the milestone's own summary bar. */
  startKey: string;
  endKey: string;
  /**
   * Counted over every task in the milestone, including ones filtered
   * off screen: a milestone is 4-of-9 done whether or not the view is
   * currently hiding the four.
   */
  doneCount: number;
  totalCount: number;
  /** Tasks in this milestone carrying no horizon. */
  unscheduledCount: number;
}

export interface RoadmapModel {
  lanes: RoadmapLane[];
  /** Tasks with no horizon. Listed rather than drawn — see `toBar`. */
  unscheduled: RoadmapBar[];
  /** Left edge of the drawn window, padded. */
  startKey: string;
  /** Right edge of the drawn window, padded. */
  endKey: string;
  /** Inclusive day count across the window. */
  totalDays: number;
}

/** Whole days from one key to another. Negative when `toKey` is earlier. */
export function dayIndex(fromKey: string, toKey: string): number {
  return Math.round(
    (parseDateKey(toKey).getTime() - parseDateKey(fromKey).getTime()) / DAY_MS
  );
}

/** The key `days` away from `key`, in either direction. */
export function shiftKey(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** The calendar day a Timestamp-alike lands on, or null if it is absent. */
function keyOf(stamp: { toDate: () => Date } | null | undefined): string | null {
  if (!stamp || typeof stamp.toDate !== "function") return null;
  const date = stamp.toDate();
  return Number.isNaN(date.getTime()) ? null : toDateKey(date);
}

/**
 * What the bar is saying, in priority order.
 *
 * Done wins outright — a finished task past its horizon is not overdue,
 * it is finished. Blocked outranks overdue because it names the reason
 * the horizon is slipping, which is the more useful thing to read.
 */
function stateOf(task: Task, dueKey: string | null, todayKey: string): RoadmapState {
  if (task.status === "done") return "done";
  if (task.isBlocked) return "blocked";
  if (dueKey && dueKey < todayKey) return "overdue";
  if (task.status === "doing") return "active";
  return "planned";
}

/**
 * One task as one bar.
 *
 * The bar runs from the day the work was opened to the day it closes:
 * the day it was actually completed when it is done, its horizon
 * otherwise. Drawing completion rather than the horizon is what makes a
 * finished lane readable — you can see which directives ran long.
 *
 * A task with no horizon gets no invented one. The previous roadmap gave
 * those a silent seven-day bar, which put a deadline on screen nobody had
 * agreed to; they come back as `scheduled: false` instead, and the view
 * lists them off the timeline.
 */
function toBar(task: Task, todayKey: string): RoadmapBar {
  const dueKey = dueDateKeyOf(task);
  const openedKey = keyOf(task.createdAt) ?? dueKey ?? todayKey;
  const doneKey = task.status === "done" ? keyOf(task.completedAt) : null;
  const closingKey = doneKey ?? dueKey ?? openedKey;

  // Backdated horizons and clock skew both produce a task that closes
  // before it opened. Order the pair rather than drawing a negative bar.
  const startKey = openedKey <= closingKey ? openedKey : closingKey;
  const endKey = openedKey <= closingKey ? closingKey : openedKey;

  return {
    taskId: task.id,
    title: task.title?.trim() || "Untitled directive",
    milestone: task.milestone?.trim() || UNGROUPED_LANE,
    assignedTo: task.assignedTo ?? [],
    state: stateOf(task, dueKey, todayKey),
    startKey,
    endKey,
    dueKey,
    scheduled: dueKey !== null,
    slipDays: dueKey && doneKey && doneKey > dueKey ? dayIndex(dueKey, doneKey) : 0,
  };
}

/**
 * Groups the project's tasks into milestone lanes and works out the
 * window the timeline has to cover.
 *
 * `todayKey` is passed in rather than read off the clock so the caller
 * owns the tick — the component re-derives on a timer, and a test can
 * pin the day.
 */
export function buildRoadmap(
  tasks: Task[],
  todayKey: string,
  options: { includeDone?: boolean } = {}
): RoadmapModel {
  const includeDone = options.includeDone ?? true;

  /* Progress is counted before the filter, so hiding completed work
     does not make every milestone read 0%. */
  const totals = new Map<string, { done: number; total: number; unscheduled: number }>();
  for (const task of tasks) {
    const lane = task.milestone?.trim() || UNGROUPED_LANE;
    const entry = totals.get(lane) ?? { done: 0, total: 0, unscheduled: 0 };
    entry.total += 1;
    if (task.status === "done") entry.done += 1;
    if (!dueDateKeyOf(task)) entry.unscheduled += 1;
    totals.set(lane, entry);
  }

  const grouped = new Map<string, RoadmapBar[]>();
  const unscheduled: RoadmapBar[] = [];

  /* Today is always inside the window, even for a project whose work is
     entirely behind or entirely ahead — a timeline with no "you are
     here" is a picture rather than a plan. */
  let minKey = todayKey;
  let maxKey = todayKey;

  for (const task of tasks) {
    const bar = toBar(task, todayKey);

    /* The window spans every directive, filtered or not. It describes
       the project, not the current view, and an axis that rescaled each
       time you hid completed work would slide every remaining bar
       sideways under the operator — the timeline would look like the
       plan had changed when only the filter had. */
    if (bar.scheduled) {
      if (bar.startKey < minKey) minKey = bar.startKey;
      if (bar.endKey > maxKey) maxKey = bar.endKey;
    }

    if (!includeDone && task.status === "done") continue;

    if (!bar.scheduled) {
      unscheduled.push(bar);
      continue;
    }

    const lane = grouped.get(bar.milestone) ?? [];
    lane.push(bar);
    grouped.set(bar.milestone, lane);
  }

  const lanes: RoadmapLane[] = [];
  for (const [milestone, bars] of grouped) {
    bars.sort(
      (a, b) => a.startKey.localeCompare(b.startKey) || a.title.localeCompare(b.title)
    );
    const counts = totals.get(milestone) ?? {
      done: 0,
      total: bars.length,
      unscheduled: 0,
    };
    lanes.push({
      milestone,
      bars,
      startKey: bars.reduce((min, b) => (b.startKey < min ? b.startKey : min), bars[0].startKey),
      endKey: bars.reduce((max, b) => (b.endKey > max ? b.endKey : max), bars[0].endKey),
      doneCount: counts.done,
      totalCount: counts.total,
      unscheduledCount: counts.unscheduled,
    });
  }

  /* Earliest lane first, so the roadmap reads left to right like the
     timeline it sits on. The catch-all lane is not a milestone anyone
     planned, so it goes last whatever its dates say. */
  lanes.sort((a, b) => {
    if (a.milestone === UNGROUPED_LANE) return 1;
    if (b.milestone === UNGROUPED_LANE) return -1;
    return a.startKey.localeCompare(b.startKey) || a.milestone.localeCompare(b.milestone);
  });

  unscheduled.sort(
    (a, b) => a.milestone.localeCompare(b.milestone) || a.title.localeCompare(b.title)
  );

  const startKey = shiftKey(minKey, -SPAN_PADDING_DAYS);
  const endKey = shiftKey(maxKey, SPAN_PADDING_DAYS);

  return {
    lanes,
    unscheduled,
    startKey,
    endKey,
    totalDays: dayIndex(startKey, endKey) + 1,
  };
}
