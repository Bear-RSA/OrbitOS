import { getTasksByOrg } from "@/lib/queries/tasks";
import { getProjectsByOrg } from "@/lib/queries/projects";
import { getMembersByOrg, getUserById } from "@/lib/queries/members";
import {
  BlockedWorkItem,
  DashboardData,
  RecentWin,
  WeeklyProgressDay,
} from "@/types/dashboard";
import {
  calculateProjectHealth,
  categorizeTasksByUrgency,
} from "@/lib/utils/dashboard-logic";
import { Member } from "@/types/member";
import { Task } from "@/types/task";
import { startOfWeek, isAfter, addDays, format, differenceInCalendarDays } from "date-fns";
import { Project } from "@/types/project";

/**
 * Dashboard Data Orchestration Service
 * This layer handles logic aggregation and ensures the UI remains lean.
 */

/**
 * Everything one dashboard load needs.
 *
 * The raw collections travel back with the assembled view model because the
 * page needs them too. Returning them from the single fetch here is what
 * stops the page re-reading `tasks` and `members` a second time on every
 * load and every refresh.
 */
export interface DashboardPayload {
  data: DashboardData;
  tasks: Task[];
  projects: Project[];
  members: Member[];
}

/**
 * Sorts projects by priority ascending (P1 first), then unprioritized by createdAt descending.
 */
function sortProjectsByPriority<T extends Project>(projects: T[]): T[] {
  return [...projects].sort((a, b) => {
    const aPri = a.priority ?? Infinity;
    const bPri = b.priority ?? Infinity;
    if (aPri !== bPri) return aPri - bPri;
    // Both unprioritized — newest first
    const aTime = a.createdAt?.toMillis?.() ?? 0;
    const bTime = b.createdAt?.toMillis?.() ?? 0;
    return bTime - aTime;
  });
}

/** Midnight today, for calendar-day comparisons rather than instant ones. */
function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * A task is overdue when its due day is behind today's, not when its due
 * instant is behind now. Shared so the service, the tasks table and the
 * health card cannot drift apart on what overdue means.
 */
function isOverdueTask(task: Task, today: Date): boolean {
  if (!task.dueDate || task.status === "done") return false;
  const due = task.dueDate.toDate();
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

/* ------------------------------------------------------------------ */
/*  Derived series                                                     */
/* ------------------------------------------------------------------ */

/**
 * Completions bucketed into the seven days of the current week.
 *
 * Always returns seven entries, including future days with a count of 0 —
 * the chart draws a full week and dims what has not happened yet, so a
 * sparse result must not collapse the axis.
 */
function buildWeeklyProgress(tasks: Task[]): WeeklyProgressDay[] {
  const weekStart = startOfWeek(new Date());

  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (task.status !== "done" || !task.completedAt) continue;
    const key = format(task.completedAt.toDate(), "yyyy-MM-dd");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    return {
      date,
      count: counts.get(format(date, "yyyy-MM-dd")) ?? 0,
      day: format(date, "EEEE"),
      shortDay: format(date, "EEE"),
    };
  });
}

/** The most recently completed tasks, newest first. */
function buildRecentWins(tasks: Task[], members: Member[], max = 5): RecentWin[] {
  const nameOf = new Map(members.map((m) => [m.id, m.name || "Unassigned"]));

  return tasks
    .filter((t) => t.status === "done" && t.completedAt)
    .sort((a, b) => b.completedAt!.toMillis() - a.completedAt!.toMillis())
    .slice(0, max)
    .map((task) => ({
      task,
      // A task can carry two operatives; the win is credited to the first.
      assigneeName: nameOf.get(task.assignedTo[0]) ?? "Unassigned",
      completedAt: task.completedAt!.toDate(),
    }));
}

/**
 * Blocked, unfinished work with the context needed to act on it.
 *
 * `isBlocked` already feeds the health score, but until now nothing told
 * the owner which task was stuck or who was sitting behind it.
 */
function buildBlockedWork(
  tasks: Task[],
  projects: Project[],
  members: Member[]
): BlockedWorkItem[] {
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const nameOf = new Map(members.map((m) => [m.id, m.name || "Unassigned"]));
  const now = new Date();

  return tasks
    .filter((t) => t.isBlocked && t.status !== "done")
    .map((task) => {
      const since = task.lastUpdatedAt ?? task.updatedAt;
      return {
        task,
        projectName: projectName.get(task.projectId) ?? "Unknown Project",
        assigneeNames: task.assignedTo.map((uid) => nameOf.get(uid) ?? "Unassigned"),
        blockedForDays: since ? Math.max(0, differenceInCalendarDays(now, since.toDate())) : 0,
      };
    })
    .sort((a, b) => b.blockedForDays - a.blockedForDays);
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                        */
/* ------------------------------------------------------------------ */

export async function getDashboardData(userId: string): Promise<DashboardPayload | null> {
  // 1. Resolve User & Role
  const user = await getUserById(userId);
  if (!user || !user.orgId) return null;

  // 2. Fetch Raw Workspace Data (Independent execution for resilience)
  const [tasksResult, projectResult, membersResult] = await Promise.allSettled([
    getTasksByOrg(user.orgId),
    getProjectsByOrg(user.orgId),
    getMembersByOrg(user.orgId)
  ]);

  const tasks = tasksResult.status === "fulfilled" ? tasksResult.value : [];
  const projects = projectResult.status === "fulfilled" ? projectResult.value : [];
  const members = membersResult.status === "fulfilled" ? membersResult.value : [];

  return { data: assembleDashboard(user, tasks, projects, members), tasks, projects, members };
}

/**
 * One assembly for every seat in the org.
 *
 * There used to be two — assembleOwnerDashboard and assembleMemberDashboard
 * — and they disagreed about more than presentation: a member got no
 * system-wide metrics, no blocked work, and only the projects they were
 * assigned to. The workspace is the unit of visibility now. The only
 * per-viewer values are the `personal` block and `myUrgencyBuckets`, and
 * `role` is carried purely so the UI can hide write controls.
 */
function assembleDashboard(
  viewer: Member,
  tasks: Task[],
  projects: Project[],
  members: Member[]
): DashboardData {
  const activeTasks = tasks.filter(t => t.status !== "done");
  const weekStart = startOfWeek(new Date());
  const today = todayMidnight();

  const completedSinceWeekStart = (t: Task) =>
    t.status === "done" && t.completedAt !== null && isAfter(t.completedAt.toDate(), weekStart);

  const metrics = {
    activeProjects: projects.length,
    overdueTasks: tasks.filter(t => isOverdueTask(t, today)).length,
    activeWorkload: activeTasks.length,
    completedThisWeek: tasks.filter(completedSinceWeekStart).length,
  };

  const myTasks = tasks.filter(t => t.assignedTo.includes(viewer.id));
  const myActiveTasks = myTasks.filter(t => t.status !== "done");

  const personal = {
    myActiveTasks: myActiveTasks.length,
    myOverdueTasks: myActiveTasks.filter(t => isOverdueTask(t, today)).length,
    myBlockedTasks: myActiveTasks.filter(t => t.isBlocked).length,
    myCompletedThisWeek: myTasks.filter(completedSinceWeekStart).length,
  };

  const sortedProjects = sortProjectsByPriority(projects);
  const myProjectIds = new Set(myTasks.map(t => t.projectId));

  return {
    role: viewer.role === "OWNER" ? "OWNER" : "MEMBER",
    metrics,
    personal,
    projects: sortedProjects,
    projectsHealth: sortedProjects.map(p =>
      calculateProjectHealth(p, tasks.filter(t => t.projectId === p.id))
    ),
    urgencyBuckets: categorizeTasksByUrgency(tasks),
    myUrgencyBuckets: categorizeTasksByUrgency(myTasks),
    myProjects: sortedProjects.filter(p => myProjectIds.has(p.id)),
    weeklyProgress: buildWeeklyProgress(tasks),
    recentWins: buildRecentWins(tasks, members),
    blockedWork: buildBlockedWork(tasks, projects, members),
  };
}
