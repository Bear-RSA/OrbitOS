import { Task } from "@/types/task";
import { Project } from "@/types/project";
import { Member } from "@/types/member";
import { 
  ProjectHealth, 
  ProjectHealthStatus, 
  UrgencyBuckets, 
  WorkloadStatus, 
  MemberWorkload 
} from "@/types/dashboard";
import { Timestamp } from "firebase/firestore";
import { 
  isSameDay, 
  isAfter, 
  isBefore, 
  addDays, 
  startOfWeek, 
  endOfWeek, 
  isWithinInterval 
} from "date-fns";

/**
 * Project Health Processor
 * Centralized business logic for determining project risk/health.
 */
export function calculateProjectHealth(project: Project, tasks: Task[]): ProjectHealth {
  const activeTasks = tasks.filter(t => t.status !== "done");
  const overdueTasks = activeTasks.filter(t => t.dueDate && isBefore(t.dueDate.toDate(), new Date()));
  const blockedTasks = activeTasks.filter(t => t.isBlocked);
  
  const totalActive = activeTasks.length;
  const overdueCount = overdueTasks.length;
  const blockedCount = blockedTasks.length;
  
  const overduePercent = totalActive > 0 ? (overdueCount / totalActive) * 100 : 0;
  
  let status: ProjectHealthStatus = "healthy";
  
  if (overduePercent > 25 || blockedCount > 0) {
    status = "at-risk";
  } else if (overduePercent > 0) {
    status = "watch";
  }
  
  const totalTasks = tasks.length;
  const executedTasks = tasks.filter(t => t.status === "done").length;
  const healthScore = totalTasks === 0 ? 0 : Math.round((executedTasks / totalTasks) * 100);

  return {
    project,
    status,
    overduePercent: Math.round(overduePercent),
    overdueCount,
    blockedCount,
    totalActiveTasks: totalActive,
    healthScore
  };
}

/**
 * Task Urgency Categorizer
 * Segments tasks into operational buckets based on due dates.
 */
export function categorizeTasksByUrgency(tasks: Task[]): UrgencyBuckets {
  const activeTasks = tasks.filter(t => t.status !== "done");
  const now = new Date();
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);
  
  return {
    overdue: activeTasks.filter(t => t.dueDate && isBefore(t.dueDate.toDate(), now) && !isSameDay(t.dueDate.toDate(), now)),
    dueToday: activeTasks.filter(t => t.dueDate && isSameDay(t.dueDate.toDate(), now)),
    dueTomorrow: activeTasks.filter(t => t.dueDate && isSameDay(t.dueDate.toDate(), tomorrow)),
    dueThisWeek: activeTasks.filter(t => t.dueDate && isWithinInterval(t.dueDate.toDate(), { start: weekStart, end: weekEnd }) && !isSameDay(t.dueDate.toDate(), now)),
    upcoming: activeTasks.filter(t => 
      t.dueDate && 
      isAfter(t.dueDate.toDate(), weekEnd)
    ),
    noDueDate: activeTasks.filter(t => !t.dueDate)
  };
}

/**
 * Member Workload Processor
 * Determines cognitive/operational load based on task metrics.
 */
export function calculateMemberWorkload(member: Member, tasks: Task[]): MemberWorkload {
  const myActiveTasks = tasks.filter(t => t.assignedTo === member.id && t.status !== "done");
  const overdue = myActiveTasks.filter(t => t.dueDate && isBefore(t.dueDate.toDate(), new Date()));
  const blocked = myActiveTasks.filter(t => t.isBlocked);
  
  const weekStart = startOfWeek(new Date());
  const completedThisWeek = tasks.filter(t => 
    t.assignedTo === member.id && 
    t.status === "done" && 
    t.completedAt && 
    isAfter(t.completedAt.toDate(), weekStart)
  ).length;

  const totalPressure = myActiveTasks.length + (overdue.length * 2) + (blocked.length * 1.5);
  
  let status: WorkloadStatus = "balanced";
  
  if (totalPressure > 15 || overdue.length > 3) {
    status = "needs-attention";
  } else if (totalPressure > 10) {
    status = "heavy";
  } else if (totalPressure < 3) {
    status = "light";
  }
  
  return {
    member,
    status,
    metrics: {
      activeTasks: myActiveTasks.length,
      overdueTasks: overdue.length,
      blockedTasks: blocked.length,
      completedThisWeek
    }
  };
}
