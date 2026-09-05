"use client";

import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { BlockedWorkItem } from "@/types/dashboard";
import { DashboardCard, CardHeader, CardEyebrow, StatusChip } from "./dashboard-card";

/* ------------------------------------------------------------------ */
/*  Blocked Work                                                       */
/*                                                                     */
/*  `isBlocked` and `blockedReason` have always existed on a task and  */
/*  have always fed calculateProjectHealth, so blocked work could drag */
/*  a project to "at risk" without the owner ever being told which     */
/*  task it was or who was waiting on it.                              */
/* ------------------------------------------------------------------ */

interface BlockedWorkCardProps {
  items: BlockedWorkItem[];
  max?: number;
}

/** A block nobody has touched in days is a different problem to a fresh one. */
function stalenessTone(days: number): "critical" | "warning" | "neutral" {
  if (days >= 7) return "critical";
  if (days >= 3) return "warning";
  return "neutral";
}

function stalenessLabel(days: number): string {
  if (days === 0) return "Today";
  return `${days}d`;
}

export function BlockedWorkCard({ items, max = 5 }: BlockedWorkCardProps) {
  const router = useRouter();
  const visible = items.slice(0, max);

  return (
    <DashboardCard tone="quiet" interactive={false}>
      <CardHeader
        title="Blocked Work"
        icon={Ban}
        meta={
          items.length > 0 ? (
            <CardEyebrow className="text-orbit-red">
              {items.length} stalled
            </CardEyebrow>
          ) : (
            <CardEyebrow>Nothing stalled</CardEyebrow>
          )
        }
      />

      {visible.length === 0 ? (
        <div className="space-y-2">
          <p className="text-[14px] font-medium text-ink">No blocked directives.</p>
          <p className="text-[13px] font-light leading-relaxed text-ink-muted">
            Work flagged as blocked from a project board is listed here with its reason.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {visible.map(({ task, projectName, assigneeNames, blockedForDays }) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => router.push(`/projects/${task.projectId}`)}
                className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-4 rounded-lg px-2 py-2.5 text-left transition-colors duration-300 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium leading-tight text-ink-muted">
                    {task.title}
                  </p>

                  {task.blockedReason && (
                    <p className="mt-1 truncate text-[12px] font-light leading-relaxed text-ink-dim">
                      {task.blockedReason}
                    </p>
                  )}

                  <p className="mt-1.5 flex items-center gap-1.5 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
                    <span className="truncate">{projectName}</span>
                    {assigneeNames.length > 0 && (
                      <>
                        <span className="text-ink-faint" aria-hidden>
                          •
                        </span>
                        <span className="truncate">{assigneeNames.join(", ")}</span>
                      </>
                    )}
                  </p>
                </div>

                <StatusChip
                  label={stalenessLabel(blockedForDays)}
                  tone={stalenessTone(blockedForDays)}
                  className="mt-0.5"
                />
              </button>
            </li>
          ))}

          {items.length > visible.length && (
            <li className="pt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-dim">
              +{items.length - visible.length} more blocked
            </li>
          )}
        </ul>
      )}
    </DashboardCard>
  );
}
