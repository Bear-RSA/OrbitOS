import { Task } from "@/types/task";
import { Member } from "@/types/member";
import { Project } from "@/types/project";
import {
  AttentionMetrics,
  ProjectRisk,
  ProjectRiskStatus,
  ProjectProgress,
  WeeklyProgressDay,
  RecentWin,
  TeamWorkloadItem,
} from "@/types/dashboard";
import { isOverdue, isInactive, getCurrentWeekDays, getShortDayLabel, getDayLabel, isSameDay, isDateThisWeek } from "./dates";

export function computeAttentionMetrics(tasks: Task[]): AttentionMetrics {
  const now = new Date();
  let overdueCount = 0;
  let inactiveCount = 0;

  for (const task of tasks) {
    if (task.status !== "done") {
      if (task.dueDate && task.dueDate.toDate() < now) {
        overdueCount++;
      }
      if (task.status === "doing") {
        const lastUpdated = task.lastUpdatedAt?.toDate();
        if (lastUpdated && isInactive(lastUpdated)) {
          inactiveCount++;
        }
      }
    }
  }

  return { overdueCount, inactiveCount };
}

export function computeProjectRisk(tasks: Task[], project: Project): ProjectRisk {
  const now = new Date();
  const activeTasks = tasks.filter((t) => t.status !== "done");
  const overdueTasks = activeTasks.filter(
    (t) => t.dueDate && t.dueDate.toDate() < now
  );

  const totalTasks = tasks.length;
  const overdueCount = overdueTasks.length;
  const overduePercent = totalTasks > 0 ? overdueCount / totalTasks : 0;

  let status: ProjectRiskStatus = "healthy";
  if (overduePercent > 0.25) {
    status = "at-risk";
  } else if (overduePercent > 0) {
    status = "watch";
  }

  return {
    project,
    status,
    overduePercent,
    overdueCount,
    totalTasks,
  };
}

export function computeProjectProgress(tasks: Task[], project: Project): ProjectProgress {
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const remainingTasks = totalTasks - doneTasks;
  const percentComplete = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return {
    project,
    percentComplete,
    doneTasks,
    remainingTasks,
    totalTasks,
  };
}

export function computeWeeklyProgress(tasks: Task[]): WeeklyProgressDay[] {
  const weekDays = getCurrentWeekDays();

  return weekDays.map((day) => {
    const count = tasks.filter((task) => {
      if (task.status !== "done" || !task.completedAt) return false;
      const completedDate = task.completedAt.toDate();
      return isSameDay(completedDate, day);
    }).length;

    return {
      day: getDayLabel(day),
      shortDay: getShortDayLabel(day),
      count,
      date: day,
    };
  });
}

export function computeRecentWins(tasks: Task[], members: Member[], limit = 5): RecentWin[] {
  const doneTasks = tasks
    .filter((t) => t.status === "done" && t.completedAt)
    .sort((a, b) => {
      const aTime = a.completedAt!.toDate().getTime();
      const bTime = b.completedAt!.toDate().getTime();
      return bTime - aTime;
    })
    .slice(0, limit);

  return doneTasks.map((task) => {
    const assignee = members.find((m) => m.id === task.assignedTo);
    return {
      task,
      assigneeName: assignee?.name ?? "Unassigned",
      completedAt: task.completedAt!.toDate(),
    };
  });
}

export function computeTeamWorkload(tasks: Task[], members: Member[]): TeamWorkloadItem[] {
  return members.map((member) => {
    const memberTasks = tasks.filter(
      (t) => t.assignedTo === member.id && t.status !== "done"
    );
    return {
      memberId: member.id,
      memberName: member.name,
      tasks: memberTasks,
      activeTasks: memberTasks.length,
    };
  });
}
