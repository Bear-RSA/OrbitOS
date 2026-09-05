"use client";

import { UrgencyBuckets } from "@/types/dashboard";
import { Project } from "@/types/project";
import { Task } from "@/types/task";
import { cn } from "@/lib/utils/classnames";
import { Clock, Calendar, AlertCircle, Inbox } from "lucide-react";
import { format } from "date-fns";
import { DashboardCard, CardHeader, CardEyebrow } from "./dashboard-card";

interface UrgencyBucketsCardProps {
  buckets: UrgencyBuckets;
  projects?: Project[];
  /**
   * Opens the task's project. Without it the rows are inert — which is how
   * they shipped: styled with `cursor-pointer` and a hover state, wired to
   * nothing.
   */
  onTaskClick?: (task: Task) => void;
  /** Optional control rendered in the header, e.g. the Mine/Everyone toggle. */
  action?: React.ReactNode;
}

export function UrgencyBucketsCard({ buckets, projects = [], onTaskClick, action }: UrgencyBucketsCardProps) {
  const categories = [
    { id: 'overdue', label: 'Overdue', tasks: buckets.overdue, icon: AlertCircle, accent: 'text-orbit-red', dueAccent: 'text-orbit-red/90', isUrgent: true },
    { id: 'dueToday', label: 'Due Today', tasks: buckets.dueToday, icon: Clock, accent: 'text-orbit-amber', dueAccent: 'text-orbit-amber/90', isUrgent: true },
    { id: 'dueTomorrow', label: 'Due Tomorrow', tasks: buckets.dueTomorrow, icon: Calendar, accent: 'text-ink', dueAccent: 'text-ink-dim', isUrgent: false },
    { id: 'dueThisWeek', label: 'Due This Week', tasks: buckets.dueThisWeek, icon: Calendar, accent: 'text-ink-muted', dueAccent: 'text-ink-dim', isUrgent: false },
  ];

  const totalUrgent = buckets.overdue.length + buckets.dueToday.length;

  return (
    <DashboardCard interactive={false} tone="quiet">
      <CardHeader
        title="Operational Horizon"
        icon={Clock}
        action={
          action ? (
            <div className="flex shrink-0 items-center gap-3">
              {totalUrgent > 0 ? (
                <CardEyebrow className="hidden text-orbit-amber sm:inline">
                  {totalUrgent} requiring attention
                </CardEyebrow>
              ) : (
                <CardEyebrow className="hidden sm:inline">All clear</CardEyebrow>
              )}
              {action}
            </div>
          ) : undefined
        }
        meta={
          totalUrgent > 0 ? (
            <CardEyebrow className="text-orbit-amber">
              {totalUrgent} requiring attention
            </CardEyebrow>
          ) : (
            <CardEyebrow>All clear</CardEyebrow>
          )
        }
      />

      <div className="grid grid-cols-1 gap-x-0 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((cat, idx) => {
          const CatIcon = cat.icon;
          return (
            <div
              key={cat.id}
              className={cn(
                "flex flex-col gap-5 rounded-xl py-1 transition-colors duration-500",
                "lg:px-6",
                idx !== 0 && "lg:border-l lg:border-line/[0.06]",
                idx === 0 && "lg:pl-0",
                idx === categories.length - 1 && "lg:pr-0"
              )}
            >
              {/* Bucket Header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <CatIcon className={cn("h-3.5 w-3.5 shrink-0", cat.tasks.length > 0 ? cat.accent : "text-ink-faint")} aria-hidden />
                  <span className={cn(
                    "truncate font-mono text-[10px] uppercase tracking-[0.16em]",
                    cat.tasks.length > 0 ? "text-ink-muted" : "text-ink-dim"
                  )}>
                    {cat.label}
                  </span>
                  {cat.id === 'overdue' && cat.tasks.length > 0 && (
                    <span className="urgency-breath h-1.5 w-1.5 shrink-0 rounded-full bg-orbit-red" aria-hidden />
                  )}
                </div>
                <span className={cn(
                  "font-mono text-[13px] tabular-nums transition-colors duration-500",
                  cat.tasks.length > 0 ? cat.accent : "text-ink-dim"
                )}>
                  {cat.tasks.length.toString().padStart(2, '0')}
                </span>
              </div>

              {/* Task Items */}
              <div className="min-h-[80px] space-y-1">
                {cat.tasks.length === 0 ? (
                  <div className="flex h-[80px] items-center justify-center rounded-lg border border-dashed border-line/[0.06]">
                    <Inbox className="h-4 w-4 text-ink-faint" aria-hidden />
                    <span className="sr-only">No tasks in {cat.label}</span>
                  </div>
                ) : (
                  cat.tasks.slice(0, 3).map((task) => {
                    const projectName = projects.find(p => p.id === task.projectId)?.name || "Unknown Project";
                    let dueStatusStr = "No signal";
                    if (task.dueDate) {
                      if (cat.id === 'overdue') {
                        const diffTime = Math.abs(new Date().getTime() - task.dueDate.toDate().getTime());
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        dueStatusStr = `Overdue by ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
                      } else if (cat.id === 'dueToday') {
                        dueStatusStr = "Due Today";
                      } else if (cat.id === 'dueTomorrow') {
                        dueStatusStr = "Due Tomorrow";
                      } else {
                        dueStatusStr = `Due ${format(task.dueDate.toDate(), "MMM dd")}`;
                      }
                    }

                    const Row = onTaskClick ? "button" : "div";

                    return (
                      <Row
                        key={task.id}
                        {...(onTaskClick
                          ? {
                              type: "button" as const,
                              onClick: () => onTaskClick(task),
                              // The row was never keyboard-reachable. A real
                              // button makes it focusable and activatable.
                              className:
                                "group/task -mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-2 text-left transition-colors duration-300 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                            }
                          : {
                              className:
                                "group/task -mx-2 rounded-lg px-2 py-2 transition-colors duration-300",
                            })}
                      >
                        <p className="truncate text-[13px] font-medium leading-tight text-ink-muted transition-colors duration-300 group-hover/task:text-ink-strong">
                          {task.title}
                        </p>
                        <p className="mt-1.5 flex items-center gap-1.5 truncate font-mono text-[9px] uppercase tracking-[0.12em]">
                          <span className="truncate text-ink-dim">{projectName}</span>
                          <span className="text-ink-faint" aria-hidden>•</span>
                          <span className={cn("shrink-0", cat.dueAccent)}>{dueStatusStr}</span>
                        </p>
                      </Row>
                    );
                  })
                )}
                {cat.tasks.length > 3 && (
                  <p className="px-0 pt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-dim">
                    +{cat.tasks.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </DashboardCard>
  );
}
