/* ------------------------------------------------------------------ */
/*  On-demand briefs                                                   */
/*                                                                     */
/*  The reports an assistant asks for in the moment, rather than the   */
/*  monthly mail: "what does my week look like" and "what needs        */
/*  attention". Pure, like `health-report` — the loader does the reads */
/*  and hands the rows in, so every bucket is testable without a       */
/*  database.                                                          */
/*                                                                     */
/*  Days are SAST days, the same convention as every due date here:    */
/*  a task due "2026-10-20" is overdue from 00:00 on the 21st in       */
/*  Johannesburg, wherever the server runs.                            */
/* ------------------------------------------------------------------ */

/** The slice of a task a brief reads. Instants are epoch millis. */
export interface BriefTask {
  id: string;
  title: string;
  projectId: string;
  status: "todo" | "doing" | "done";
  assignedTo: string[];
  dueDateKey: string | null;
  isBlocked: boolean;
  blockedReason: string | null;
  completedAtMs: number | null;
  lastUpdatedMs: number | null;
}

export interface BriefMeeting {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  meetingUrl: string | null;
}

/** One task as a brief shows it: enough to act on, nothing more. */
export interface BriefLine {
  id: string;
  title: string;
  project: string | null;
  dueDate: string | null;
  status: "todo" | "doing" | "done";
  assignees: string[];
  blockedReason?: string | null;
  /** Whole days past due. Only on overdue lines. */
  daysOverdue?: number;
  /** Whole days since anyone touched it. Only on stalled lines. */
  daysIdle?: number;
}

const DAY_MS = 86_400_000;

/** Most lines in any one bucket. The totals still count everything. */
export const MAX_BRIEF_LINES = 25;

/** A task "doing" with no update for this many days is stalled. */
export const STALL_DAYS = 3;

/** Adds days to a "YYYY-MM-DD" key without going through a timezone. */
export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, both day keys. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

interface Lookups {
  projects: Map<string, string>;
  people: Map<string, string>;
}

function lineFor(task: BriefTask, lookups: Lookups): BriefLine {
  return {
    id: task.id,
    title: task.title,
    project: lookups.projects.get(task.projectId) ?? null,
    dueDate: task.dueDateKey,
    status: task.status,
    assignees: task.assignedTo.map((uid) => lookups.people.get(uid) ?? "Unknown member"),
  };
}

/** Earliest due first, undated last, then by title so the order is stable. */
function byDue(a: BriefTask, b: BriefTask): number {
  return (
    (a.dueDateKey ?? "9999-99-99").localeCompare(b.dueDateKey ?? "9999-99-99") ||
    a.title.localeCompare(b.title)
  );
}

function bucket(lines: BriefLine[]): { total: number; tasks: BriefLine[] } {
  return { total: lines.length, tasks: lines.slice(0, MAX_BRIEF_LINES) };
}

/* ------------------------------------------------------------------ */
/*  My week                                                            */
/* ------------------------------------------------------------------ */

export interface MyWeekBrief {
  today: string;
  /** Last day of the seven-day window, inclusive. */
  through: string;
  overdue: { total: number; tasks: BriefLine[] };
  dueThisWeek: { total: number; tasks: BriefLine[] };
  blocked: { total: number; tasks: BriefLine[] };
  inProgress: number;
  completedLast7Days: number;
  meetings: { id: string; title: string; start: string; end: string; meetingUrl: string | null }[];
}

/**
 * One person's next seven days: what is late, what is due, what is
 * stuck, and which meetings are coming. `tasks` should already be the
 * ones assigned to them.
 */
export function buildMyWeek(input: {
  todayKey: string;
  nowMs: number;
  tasks: BriefTask[];
  meetings: BriefMeeting[];
  projects: Map<string, string>;
  people: Map<string, string>;
}): MyWeekBrief {
  const { todayKey, nowMs } = input;
  const through = shiftDayKey(todayKey, 6);
  const lookups = { projects: input.projects, people: input.people };
  const open = input.tasks.filter((t) => t.status !== "done").sort(byDue);

  const overdue = open
    .filter((t) => t.dueDateKey !== null && t.dueDateKey < todayKey)
    .map((t) => ({ ...lineFor(t, lookups), daysOverdue: daysBetween(t.dueDateKey!, todayKey) }));

  const dueThisWeek = open
    .filter((t) => t.dueDateKey !== null && t.dueDateKey >= todayKey && t.dueDateKey <= through)
    .map((t) => lineFor(t, lookups));

  const blocked = open
    .filter((t) => t.isBlocked)
    .map((t) => ({ ...lineFor(t, lookups), blockedReason: t.blockedReason }));

  const weekEndMs = nowMs + 7 * DAY_MS;
  const meetings = input.meetings
    .filter((m) => m.endMs > nowMs && m.startMs < weekEndMs)
    .sort((a, b) => a.startMs - b.startMs)
    .map((m) => ({
      id: m.id,
      title: m.title,
      start: new Date(m.startMs).toISOString(),
      end: new Date(m.endMs).toISOString(),
      meetingUrl: m.meetingUrl,
    }));

  return {
    today: todayKey,
    through,
    overdue: bucket(overdue),
    dueThisWeek: bucket(dueThisWeek),
    blocked: bucket(blocked),
    inProgress: open.filter((t) => t.status === "doing").length,
    completedLast7Days: input.tasks.filter(
      (t) => t.status === "done" && t.completedAtMs !== null && t.completedAtMs >= nowMs - 7 * DAY_MS
    ).length,
    meetings,
  };
}

/* ------------------------------------------------------------------ */
/*  Needs attention                                                    */
/* ------------------------------------------------------------------ */

export interface AttentionBrief {
  today: string;
  overdue: { total: number; tasks: BriefLine[] };
  blocked: { total: number; tasks: BriefLine[] };
  /** Open tasks nobody is on. */
  unassigned: { total: number; tasks: BriefLine[] };
  /** In progress with no update for `STALL_DAYS` or more. */
  stalled: { total: number; tasks: BriefLine[] };
}

/**
 * What in a workspace (or one project) is slipping. Each open task can
 * appear in more than one bucket — an overdue task that is also blocked
 * is two separate problems for whoever reads this.
 */
export function buildAttention(input: {
  todayKey: string;
  nowMs: number;
  tasks: BriefTask[];
  projects: Map<string, string>;
  people: Map<string, string>;
}): AttentionBrief {
  const { todayKey, nowMs } = input;
  const lookups = { projects: input.projects, people: input.people };
  // Tasks in archived projects are hidden in the app, so they are hidden here.
  const open = input.tasks
    .filter((t) => t.status !== "done" && input.projects.has(t.projectId))
    .sort(byDue);

  const overdue = open
    .filter((t) => t.dueDateKey !== null && t.dueDateKey < todayKey)
    .map((t) => ({ ...lineFor(t, lookups), daysOverdue: daysBetween(t.dueDateKey!, todayKey) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.title.localeCompare(b.title));

  const blocked = open
    .filter((t) => t.isBlocked)
    .map((t) => ({ ...lineFor(t, lookups), blockedReason: t.blockedReason }));

  const unassigned = open.filter((t) => t.assignedTo.length === 0).map((t) => lineFor(t, lookups));

  const stalled = open
    .filter(
      (t) =>
        t.status === "doing" &&
        t.lastUpdatedMs !== null &&
        nowMs - t.lastUpdatedMs >= STALL_DAYS * DAY_MS
    )
    .map((t) => ({ ...lineFor(t, lookups), daysIdle: Math.floor((nowMs - t.lastUpdatedMs!) / DAY_MS) }))
    .sort((a, b) => b.daysIdle - a.daysIdle);

  return {
    today: todayKey,
    overdue: bucket(overdue),
    blocked: bucket(blocked),
    unassigned: bucket(unassigned),
    stalled: bucket(stalled),
  };
}
