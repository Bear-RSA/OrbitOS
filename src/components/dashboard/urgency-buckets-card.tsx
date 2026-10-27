"use client";

import { UrgencyBuckets } from "@/types/dashboard";
import { Project } from "@/types/project";
import { Task } from "@/types/task";
import { cn } from "@/lib/utils/classnames";
import { Clock, Calendar, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { differenceInCalendarDays, format } from "date-fns";
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

  const shown = categories.map((cat) => cat.tasks.length > 0);
  const firstShown = shown.indexOf(true);
  const lastShown = shown.lastIndexOf(true);

  const totalUrgent = buckets.overdue.length + buckets.dueToday.length;
  const weekIsEmpty = categories.every((cat) => cat.tasks.length === 0);

  // An empty week used to draw four dashed boxes with an inbox icon in each.
  // One line says the same thing, and the space goes to the next task that
  // does have a date, so the card still points somewhere.
  const nextUpcoming = weekIsEmpty
    ? [...buckets.upcoming].sort(
        (a, b) => a.dueDate!.toDate().getTime() - b.dueDate!.toDate().getTime()
      )[0]
    : undefined;

  // The empty-week body already says "all clear", so the header stays quiet.
  const eyebrow =
    totalUrgent > 0 ? (
      <CardEyebrow className="text-orbit-amber">{totalUrgent} requiring attention</CardEyebrow>
    ) : weekIsEmpty ? null : (
      <CardEyebrow>All clear</CardEyebrow>
    );

  return (
    <DashboardCard interactive={false} tone="quiet">
      <CardHeader
        title="Coming up"
        icon={Clock}
        action={
          action ? (
            <div className="flex shrink-0 items-center gap-3">
              {eyebrow && <span className="hidden sm:inline">{eyebrow}</span>}
              {action}
            </div>
          ) : undefined
        }
        meta={eyebrow ?? undefined}
      />

      {weekIsEmpty ? (
        <EmptyWeek
          next={nextUpcoming}
          projects={projects}
          undatedCount={buckets.noDueDate.length}
          onTaskClick={onTaskClick}
        />
      ) : (
      // Empty buckets fold away instead of saying "Nothing overdue". On wide
      // screens the columns are a flex row and an empty one animates its grow
      // to 0 while the others widen into the space; narrower layouts just
      // drop it from the grid.
      <div className="grid grid-cols-1 gap-x-0 gap-y-8 sm:grid-cols-2 lg:flex lg:gap-0">
        {categories.map((cat, idx) => {
          const CatIcon = cat.icon;
          const empty = cat.tasks.length === 0;
          return (
            <div
              key={cat.id}
              aria-hidden={empty || undefined}
              style={{ flexGrow: empty ? 0 : 1 }}
              className={cn(
                "flex min-w-0 flex-col rounded-xl py-1",
                "lg:basis-0 lg:overflow-hidden lg:border-l lg:px-6",
                "lg:transition-[flex-grow,padding,opacity,border-color] lg:duration-500 lg:ease-[cubic-bezier(0.32,0.72,0,1)]",
                "motion-reduce:transition-none",
                idx > firstShown ? "lg:border-line/[0.06]" : "lg:border-transparent",
                idx <= firstShown && "lg:pl-0",
                idx >= lastShown && "lg:pr-0",
                empty && "max-lg:hidden lg:pointer-events-none lg:border-l-0 lg:px-0 lg:opacity-0"
              )}
            >
              {/* Fixed min width so a collapsing column clips instead of reflowing. */}
              <div className="flex flex-col gap-5 lg:min-w-[200px]">
              {/* Bucket Header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <CatIcon className={cn("h-3.5 w-3.5 shrink-0", cat.tasks.length > 0 ? cat.accent : "text-ink-faint")} aria-hidden />
                  <span className={cn(
                    "truncate text-[12px]",
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
              <div className="space-y-1">
                {cat.tasks.slice(0, 3).map((task) => {
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
                        <p className="truncate text-[13px] font-medium leading-tight text-ink-muted transition-colors duration-300 group-hover/task:text-ink-strong">
                          {task.title}
                        </p>
                        <p className="mt-1.5 flex items-center gap-1.5 truncate text-[12px]">
                          <span className="truncate text-ink-dim">{projectName}</span>
                          <span className="text-ink-dim" aria-hidden>•</span>
                          <span className={cn("shrink-0", cat.dueAccent)}>{dueStatusStr}</span>
                        </p>
                      </Row>
                    );
                  })}
                {cat.tasks.length > 3 && (
                  <p className="px-0 pt-2 text-[12px] text-ink-dim">
                    +{cat.tasks.length - 3} more
                  </p>
                )}
              </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </DashboardCard>
  );
}

function EmptyWeek({
  next,
  projects,
  undatedCount,
  onTaskClick,
}: {
  next?: Task;
  projects: Project[];
  undatedCount: number;
  onTaskClick?: (task: Task) => void;
}) {
  const nextProject = next ? projects.find((p) => p.id === next.projectId)?.name : undefined;

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orbit-green/10 ring-1 ring-inset ring-orbit-green/20">
          <CheckCircle2 className="h-4 w-4 text-orbit-green" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-ink">Nothing due this week</p>
          <p className="mt-0.5 text-[12px] text-ink-dim">
            {undatedCount > 0
              ? `${undatedCount} open task${undatedCount === 1 ? " has" : "s have"} no due date`
              : "No overdue work either"}
          </p>
        </div>
      </div>

      {next && (
        <div className="min-w-0 border-t border-line/[0.06] pt-4 sm:w-[min(360px,45%)] sm:shrink-0 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
          <NextUpRow task={next} projectName={nextProject} onTaskClick={onTaskClick} />
        </div>
      )}
    </div>
  );
}

function NextUpRow({
  task,
  projectName,
  onTaskClick,
}: {
  task: Task;
  projectName?: string;
  onTaskClick?: (task: Task) => void;
}) {
  const due = task.dueDate!.toDate();
  const daysAway = differenceInCalendarDays(due, new Date());
  const countdown = daysAway <= 1 ? "tomorrow" : `in ${daysAway} days`;

  // Stacked like the status on the left (title over detail), so the two
  // halves read as a pair instead of a sentence and a form field.
  const body = (
    <>
      <p className="text-[11px] uppercase tracking-wider text-ink-faint">
        Next up <span aria-hidden>·</span> <span className="normal-case tracking-normal">{countdown}</span>
      </p>
      <div className="mt-1 flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate text-[14px] font-medium text-ink-muted transition-colors duration-300 group-hover/next:text-ink-strong">
          {task.title}
        </span>
        {onTaskClick && (
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform duration-300 group-hover/next:translate-x-0.5 group-hover/next:text-ink-muted" aria-hidden />
        )}
      </div>
      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-ink-dim">
        {projectName && (
          <>
            <span className="truncate">{projectName}</span>
            <span aria-hidden>·</span>
          </>
        )}
        <span className="shrink-0 font-mono tabular-nums">{format(due, "MMM d")}</span>
      </p>
    </>
  );

  const className =
    "group/next -mx-3 -my-2 block w-[calc(100%+1.5rem)] min-w-0 rounded-lg px-3 py-2";

  return onTaskClick ? (
    <button
      type="button"
      onClick={() => onTaskClick(task)}
      className={cn(
        className,
        "text-left transition-colors duration-300 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      )}
    >
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}
