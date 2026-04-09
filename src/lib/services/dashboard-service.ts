import { getTasksByOrg } from "@/lib/queries/tasks";
import { getProjectsByOrg } from "@/lib/queries/projects"; 
import { getMembersByOrg, getUserById } from "@/lib/queries/members";
import { 
  OwnerDashboardData, 
  MemberDashboardData, 
  OrbitalDashboardData 
} from "@/types/dashboard";
import { 
  calculateProjectHealth, 
  categorizeTasksByUrgency, 
  calculateMemberWorkload 
} from "@/lib/utils/dashboard-logic";
import { Member } from "@/types/member";
import { Task } from "@/types/task";
import { startOfWeek, isAfter, isSameDay } from "date-fns";

/**
 * Dashboard Data Orchestration Service
 * This layer handles logic aggregation and ensures the UI remains lean.
 */

export async function getDashboardData(userId: string): Promise<OrbitalDashboardData | null> {
  // 1. Resolve User & Role
  const user = await getUserById(userId);
  if (!user || !user.orgId) return null;

  // 2. Fetch Raw Workspace Data (Independent execution for resilience)
  const [tasksResult, projectResult, membersResult] = await Promise.allSettled([
    getTasksByOrg(user.orgId),
    getProjectsByOrg(user.orgId),
    getMembersByOrg(user.orgId)
  ]);

  const tasks = tasksResult.status === 'fulfilled' ? tasksResult.value : [];
  const projects = projectResult.status === 'fulfilled' ? projectResult.value : [];
  const members = membersResult.status === 'fulfilled' ? membersResult.value : [];
  
  if (user.role === "owner") {
    return assembleOwnerDashboard(user, tasks, projects, members);
  } else {
    return assembleMemberDashboard(user, tasks, projects, members);
  }
}

function assembleOwnerDashboard(
  owner: Member,
  tasks: Task[],
  projects: any[],
  members: Member[]
): OwnerDashboardData {
  const activeTasks = tasks.filter(t => t.status !== "done");
  const weekStart = startOfWeek(new Date());
  
  const metrics = {
    activeProjects: projects.length,
    overdueTasks: tasks.filter(t => t.dueDate && t.status !== "done" && isAfter(new Date(), t.dueDate.toDate()) && !isSameDay(new Date(), t.dueDate.toDate())).length,
    teamCapacity: members.length * 5, // Simple baseline
    completedThisWeek: tasks.filter(t => t.status === "done" && t.completedAt && isAfter(t.completedAt.toDate(), weekStart)).length
  };

  const projectsHealth = projects.map(p => calculateProjectHealth(p, tasks.filter(t => t.projectId === p.id)));
  const urgencyBuckets = categorizeTasksByUrgency(tasks);
  const teamWorkload = members.map(m => calculateMemberWorkload(m, tasks));

  return {
    role: "owner",
    metrics,
    projectsHealth,
    urgencyBuckets,
    teamWorkload,
    recentActivity: [] // Activities can be added here if session logging is implemented
  };
}

function assembleMemberDashboard(
  member: Member,
  tasks: Task[],
  projects: any[],
  members: Member[]
): MemberDashboardData {
  const myTasks = tasks.filter(t => t.assignedTo === member.id);
  const myActiveTasks = myTasks.filter(t => t.status !== "done");
  const weekStart = startOfWeek(new Date());

  const metrics = {
    myActiveTasks: myActiveTasks.length,
    myOverdueTasks: myActiveTasks.filter(t => t.dueDate && isAfter(new Date(), t.dueDate.toDate()) && !isSameDay(new Date(), t.dueDate.toDate())).length,
    myBlockedTasks: myActiveTasks.filter(t => t.isBlocked).length,
    myCompletedThisWeek: myTasks.filter(t => t.status === "done" && t.completedAt && isAfter(t.completedAt.toDate(), weekStart)).length
  };

  const myProjects = projects.filter(p => tasks.some(t => t.projectId === p.id && t.assignedTo === member.id));
  const myUrgencyBuckets = categorizeTasksByUrgency(myTasks);
  const myWorkload = calculateMemberWorkload(member, tasks);

  return {
    role: "member",
    metrics,
    myProjects,
    myUrgencyBuckets,
    myWorkload,
    recentActivity: []
  };
}
