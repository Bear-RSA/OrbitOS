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

export interface ActivityFeedItem {
  id: string;
  type: "task_completed" | "task_blocked" | "project_created" | "member_joined";
  user: Member;
  targetLink: string;
  timestamp: Date;
  metadata: Record<string, any>;
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
  recentActivity: ActivityFeedItem[];
}

export interface MemberDashboardData {
  role: "MEMBER";
  metrics: {
    myActiveTasks: number;
    myOverdueTasks: number;
    myBlockedTasks: number;
    myCompletedThisWeek: number;
  };
  myProjects: Project[];
  myProjectsHealth: ProjectHealth[];
  myUrgencyBuckets: UrgencyBuckets;
  myWorkload: MemberWorkload;
  recentActivity: ActivityFeedItem[];
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

export type OrbitalDashboardData = OwnerDashboardData | MemberDashboardData;

