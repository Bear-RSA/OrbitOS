import { Task } from "./task";
import { Project } from "./project";
import { Member } from "./member";

export type ProjectHealthStatus = "healthy" | "watch" | "at-risk";
export type WorkloadStatus = "light" | "balanced" | "heavy" | "needs-attention";

export interface UrgencyBuckets {
  overdue: Task[];
  dueToday: Task[];
  dueTomorrow: Task[];
  dueThisWeek: Task[];
  upcoming: Task[];
  noDueDate: Task[];
}

export interface ProjectHealth {
  project: Project;
  status: ProjectHealthStatus;
  overduePercent: number;
  overdueCount: number;
  blockedCount: number;
  totalActiveTasks: number;
  healthScore: number;
}

export interface MemberWorkload {
  member: Member;
  status: WorkloadStatus;
  metrics: {
    activeTasks: number;
    overdueTasks: number;
    blockedTasks: number;
    completedThisWeek: number;
  };
}

export interface DashboardMetric {
  label: string;
  value: number;
  trend?: number;
  status?: "positive" | "negative" | "neutral";
}

export interface ProjectProgress {
  project: Project;
  percentComplete: number;
  doneTasks: number;
  remainingTasks: number;
}

export interface RecentWin {
  task: Task;
  assigneeName: string;
  completedAt: Date;
}

export interface WeeklyProgressDay {
  count: number;
  date: Date;
  day: string;
  shortDay: string;
}

/** A blocked task with the context needed to act on it without a lookup. */
export interface BlockedWorkItem {
  task: Task;
  projectName: string;
  assigneeNames: string[];
  /** Whole days since the task was last touched, as a staleness proxy. */
  blockedForDays: number;
}

/** The viewer's own slice. The only per-person numbers on the page. */
export interface PersonalMetrics {
  myActiveTasks: number;
  myOverdueTasks: number;
  myBlockedTasks: number;
  myCompletedThisWeek: number;
}

/**
 * One dashboard for the whole workspace.
 *
 * Owners and members used to get two different assemblies: a member saw
 * only their own projects, no system health, no blocked work and no
 * executive metrics. Everyone in an org now sees the same operational
 * picture — the org is the unit, not the seat.
 *
 * `role` survives only to gate write controls (invite, revoke, reorder).
 * It changes which buttons render, never which data does.
 */
export interface DashboardData {
  role: "OWNER" | "MEMBER";
  /** Org-wide. Identical for every seat in the workspace. */
  metrics: {
    activeProjects: number;
    overdueTasks: number;
    activeWorkload: number;
    completedThisWeek: number;
  };
  /** The viewer's own numbers. The one card that differs per person. */
  personal: PersonalMetrics;
  projects: Project[];
  projectsHealth: ProjectHealth[];
  /**
   * The at most two projects the dashboard spotlights, ranked by how soon
   * their next unfinished task is due. Empty when nothing anywhere carries
   * a due date, in which case the dashboard shows no project section.
   */
  focusProjects: ProjectHealth[];
  /** Org-wide urgency. The Horizon default. */
  urgencyBuckets: UrgencyBuckets;
  /** The viewer's own tasks, behind the Horizon's Mine toggle. */
  myUrgencyBuckets: UrgencyBuckets;
  /** Only the projects the viewer holds work in — for the Mine toggle. */
  myProjects: Project[];
  weeklyProgress: WeeklyProgressDay[];
  recentWins: RecentWin[];
  blockedWork: BlockedWorkItem[];
}
