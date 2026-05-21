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
import { 
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
 * Uses midnight-normalized calendar-day comparisons to stay
 * synchronized with the project-level TasksTable view.
 */
export function categorizeTasksByUrgency(tasks: Task[]): UrgencyBuckets {
  const activeTasks = tasks.filter(t => t.status !== "done");

  // Normalize "today" to midnight for calendar-day comparisons
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrowStart = addDays(today, 1);
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);

  /** Normalize a Firestore Timestamp to midnight */
  const toMidnight = (t: Task): Date => {
    const d = new Date(t.dueDate!.toDate());
    d.setHours(0, 0, 0, 0);
    return d;
  };

  /** Calendar-day difference (due − today) in whole days */
  const daysDiff = (t: Task): number => {
    const due = toMidnight(t);
    return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };
  
  return {
    overdue: activeTasks.filter(t => t.dueDate && daysDiff(t) < 0),
    dueToday: activeTasks.filter(t => t.dueDate && daysDiff(t) === 0),
    dueTomorrow: activeTasks.filter(t => t.dueDate && daysDiff(t) === 1),
    dueThisWeek: activeTasks.filter(t => {
      if (!t.dueDate) return false;
      const due = toMidnight(t);
      const diff = daysDiff(t);
      // Within the current week, but exclude today and tomorrow (they have their own buckets)
      return isWithinInterval(due, { start: weekStart, end: weekEnd }) && diff !== 0 && diff !== 1;
    }),
    upcoming: activeTasks.filter(t => {
      if (!t.dueDate) return false;
      const due = toMidnight(t);
      return isAfter(due, weekEnd);
    }),
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
