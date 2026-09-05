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

/**
 * One row of the dashboard activity log.
 *
 * Deliberately not `ActivityEvent`: that carries a Firestore `Timestamp`,
 * and this crosses a server-action boundary where only plain values
 * survive. The action serializes `timestamp` to an ISO string.
 */
export interface DashboardActivityItem {
  id: string;
  eventType: string;
  projectId: string | null;
  actorName: string;
  metadata: Record<string, any>;
  /** ISO 8601. Null when the server write has not resolved yet. */
  timestamp: string | null;
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

export interface OwnerDashboardData {
  role: "OWNER";
  metrics: {
    activeProjects: number;
    overdueTasks: number;
    activeWorkload: number;
    completedThisWeek: number;
  };
  projectsHealth: ProjectHealth[];
  urgencyBuckets: UrgencyBuckets;
  teamWorkload: MemberWorkload[];
  weeklyProgress: WeeklyProgressDay[];
  recentWins: RecentWin[];
  blockedWork: BlockedWorkItem[];
}

export interface MemberDashboardData {
  role: "MEMBER";
  metrics: {
    myActiveTasks: number;
    myOverdueTasks: number;
    myBlockedTasks: number;
    myCompletedThisWeek: number;
  };
  /** Only projects the member actually holds work in. */
  myProjects: Project[];
  myProjectsHealth: ProjectHealth[];
  /** The member's own tasks. This is what their Horizon shows by default. */
  myUrgencyBuckets: UrgencyBuckets;
  /** Org-wide urgency buckets — reachable behind the Horizon's toggle. */
  urgencyBuckets: UrgencyBuckets;
  /** Every project in the org, for the toggled org-wide Horizon view. */
  orgProjects: Project[];
  myWorkload: MemberWorkload;
  /**
   * Every operator in the org, same shape the owner gets. Members can see
   * who else is on the roster and how loaded they are; adding and revoking
   * seats stays owner-only, enforced in the server actions.
   */
  teamWorkload: MemberWorkload[];
  weeklyProgress: WeeklyProgressDay[];
  recentWins: RecentWin[];
}

export type OrbitalDashboardData = OwnerDashboardData | MemberDashboardData;
