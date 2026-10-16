import { healthVerdict } from "@/lib/utils/dashboard-logic";
import { sastDayKey, sastInstant } from "@/lib/utils/sast";

/* ------------------------------------------------------------------ */
/*  Monthly health report                                              */
/*                                                                     */
/*  What one workspace's month looked like, worked out from the tasks  */
/*  it already stores. Pure: the runner in `monthly-run` does the      */
/*  reads and hands the rows in, so every number here is testable      */
/*  without a database.                                                */
/*                                                                     */
/*  A month is a SAST calendar month. "Done in September" means done   */
/*  between 00:00 on 1 September and 00:00 on 1 October in             */
/*  Johannesburg, not in whatever zone the server runs in.             */
/* ------------------------------------------------------------------ */

/** The slice of a task the report reads. Instants are epoch millis. */
export interface ReportTask {
  projectId: string;
  status: "todo" | "doing" | "done";
  assignedTo: string[];
  createdAtMs: number | null;
  completedAtMs: number | null;
  /** "YYYY-MM-DD", the day it is due. */
  dueDateKey: string | null;
  isBlocked: boolean;
}

export interface ReportProject {
  id: string;
  name: string;
  archived: boolean;
}

export interface ReportPerson {
  uid: string;
  name: string;
}

export interface ProjectLine {
  id: string;
  name: string;
  completed: number;
  missed: number;
  /** Share of the project's tasks that are done, 0 to 100. */
  score: number;
  verdict: string;
}

export interface Contributor {
  uid: string;
  name: string;
  completed: number;
}

export interface HealthReport {
  /** "YYYY-MM", the month reported on. */
  monthKey: string;
  completed: number;
  /** Completed in the month before, for the comparison line. */
  completedPrevious: number;
  created: number;
  /** Tasks whose due day fell inside the month. */
  dueInMonth: number;
  /** Of those, finished on or before their due day. */
  dueOnTime: number;
  /** Of those, not finished by their due day (late or still open). */
  missed: number;
  /** Still open at the end of the month with a due day before it ended. */
  openOverdue: number;
  /** Open and flagged blocked when the report was built. */
  blockedNow: number;
  topContributors: Contributor[];
  projects: ProjectLine[];
}

/** Contributors named in the mail. More than three is a leaderboard. */
const MAX_CONTRIBUTORS = 3;

/** Projects listed in the mail; the rest are on the dashboard. */
export const MAX_PROJECT_LINES = 5;

/** "YYYY-MM" of the month before the one `now` falls in, in SAST. */
export function previousMonthKey(now: Date): string {
  const [y, m] = sastDayKey(now).split("-").map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return `${prevY}-${String(prevM).padStart(2, "0")}`;
}

/** The month after `monthKey`. */
function nextMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** The month before `monthKey`. */
function priorMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Start and end instants (end exclusive) of a SAST month, as millis. */
export function monthBounds(monthKey: string): { start: number; end: number } {
  return {
    start: sastInstant(`${monthKey}-01`, 0).getTime(),
    end: sastInstant(`${nextMonthKey(monthKey)}-01`, 0).getTime(),
  };
}

function within(ms: number | null, bounds: { start: number; end: number }): boolean {
  return ms !== null && ms >= bounds.start && ms < bounds.end;
}

/** Finished on or before the day it was due, read in SAST. */
function doneOnTime(task: ReportTask): boolean {
  if (task.status !== "done" || task.completedAtMs === null || !task.dueDateKey) {
    return false;
  }
  return sastDayKey(new Date(task.completedAtMs)) <= task.dueDateKey;
}

/** Whether a month had enough going on to be worth a mail. */
export function isQuietMonth(report: HealthReport): boolean {
  return (
    report.completed === 0 &&
    report.created === 0 &&
    report.dueInMonth === 0 &&
    report.openOverdue === 0
  );
}

export function buildHealthReport(input: {
  monthKey: string;
  tasks: ReportTask[];
  projects: ReportProject[];
  people: ReportPerson[];
}): HealthReport {
  const { monthKey } = input;
  const month = monthBounds(monthKey);
  const previous = monthBounds(priorMonthKey(monthKey));
  const firstDay = `${monthKey}-01`;
  const lastDayExclusive = `${nextMonthKey(monthKey)}-01`;

  // Archived projects are hidden from the workspace, so their work is
  // hidden from the report too.
  const live = new Map(
    input.projects.filter((p) => !p.archived).map((p) => [p.id, p])
  );
  const tasks = input.tasks.filter((t) => live.has(t.projectId));

  const completedInMonth = tasks.filter(
    (t) => t.status === "done" && within(t.completedAtMs, month)
  );

  const dueInMonth = tasks.filter(
    (t) => t.dueDateKey !== null && t.dueDateKey >= firstDay && t.dueDateKey < lastDayExclusive
  );
  const dueOnTime = dueInMonth.filter(doneOnTime).length;

  const openOverdue = tasks.filter(
    (t) =>
      t.dueDateKey !== null &&
      t.dueDateKey < lastDayExclusive &&
      // Finished after the month ended still counts: on the last day of
      // the month it was open and overdue.
      (t.status !== "done" || t.completedAtMs === null || t.completedAtMs >= month.end)
  ).length;

  /* Contributors. A task done by three people counts once for each of
     them: each one did the work, and splitting it would make shared work
     look smaller than solo work. */
  const names = new Map(input.people.map((p) => [p.uid, p.name]));
  const byPerson = new Map<string, number>();
  for (const task of completedInMonth) {
    for (const uid of task.assignedTo) {
      if (!names.has(uid)) continue;
      byPerson.set(uid, (byPerson.get(uid) ?? 0) + 1);
    }
  }
  const topContributors = [...byPerson.entries()]
    .map(([uid, completed]) => ({ uid, name: names.get(uid)!, completed }))
    .sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name))
    .slice(0, MAX_CONTRIBUTORS);

  /* Projects. Anything that slipped comes first, because that is what an
     owner reads the report to find; then the busiest. A project with
     nothing done and nothing missed had no month to report. */
  const projects: ProjectLine[] = [...live.values()]
    .map((project) => {
      const own = tasks.filter((t) => t.projectId === project.id);
      const done = own.filter((t) => t.status === "done").length;
      const score = own.length === 0 ? 0 : Math.round((done / own.length) * 100);
      return {
        id: project.id,
        name: project.name,
        completed: completedInMonth.filter((t) => t.projectId === project.id).length,
        missed: dueInMonth.filter((t) => t.projectId === project.id && !doneOnTime(t)).length,
        score,
        verdict: healthVerdict(score).label,
      };
    })
    .filter((line) => line.completed > 0 || line.missed > 0)
    .sort(
      (a, b) =>
        b.missed - a.missed || b.completed - a.completed || a.name.localeCompare(b.name)
    );

  return {
    monthKey,
    completed: completedInMonth.length,
    completedPrevious: tasks.filter(
      (t) => t.status === "done" && within(t.completedAtMs, previous)
    ).length,
    created: tasks.filter((t) => within(t.createdAtMs, month)).length,
    dueInMonth: dueInMonth.length,
    dueOnTime,
    missed: dueInMonth.length - dueOnTime,
    openOverdue,
    blockedNow: tasks.filter((t) => t.status !== "done" && t.isBlocked).length,
    topContributors,
    projects,
  };
}
