import { Task } from "./task";
import { Project } from "./project";
import { Member } from "./member";

export type ProjectRiskStatus = "healthy" | "watch" | "at-risk";

export interface AttentionMetrics {
  overdueCount: number;
  inactiveCount: number;
}

export interface ProjectRisk {
  project: Project;
  status: ProjectRiskStatus;
  overduePercent: number;
  overdueCount: number;
  totalTasks: number;
}

export interface ProjectProgress {
  project: Project;
  percentComplete: number;
  doneTasks: number;
  remainingTasks: number;
  totalTasks: number;
}

export interface WeeklyProgressDay {
  day: string;
  shortDay: string;
  count: number;
  date: Date;
}

export interface RecentWin {
  task: Task;
  assigneeName: string;
  completedAt: Date;
}

export interface TeamWorkloadItem {
  memberId: string;
  memberName: string;
  tasks: Task[];
  activeTasks: number;
}

export interface DashboardData {
  tasks: Task[];
  project: Project | null;
  members: Member[];
  currentUser: Member;
  // Computed metrics
  attention: AttentionMetrics;
  projectRisk: ProjectRisk | null;
  projectProgress: ProjectProgress | null;
  weeklyProgress: WeeklyProgressDay[];
  recentWins: RecentWin[];
  teamWorkload: TeamWorkloadItem[];
}
