"use client";

import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { ProjectHealth } from "@/types/dashboard";
import { DashboardCard, CardHeader, CardEyebrow, CardEmpty, StatusChip } from "./dashboard-card";

/* ------------------------------------------------------------------ */
/*  Projects at risk                                                   */
/*                                                                     */
/*  `calculateProjectHealth` has been grading every project on each    */
/*  load, but the grade only surfaced as a tint on whichever two cards */
/*  made "Projects in focus". A project could sit at risk for a week   */
/*  without a nearer deadline ever putting it on the page. This lists  */
/*  every project that is not healthy, with the reason in words, so    */
/*  nobody has to open a board to learn why it is red.                 */
/* ------------------------------------------------------------------ */

interface ProjectsAtRiskCardProps {
  projectsHealth: ProjectHealth[];
  max?: number;
}

function reason({ overdueCount, blockedCount, totalActiveTasks }: ProjectHealth): string {
  const parts: string[] = [];
  if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
  if (blockedCount > 0) parts.push(`${blockedCount} blocked`);
  parts.push(`${totalActiveTasks} open`);
  return parts.join(" · ");
}

export function ProjectsAtRiskCard({ projectsHealth, max = 5 }: ProjectsAtRiskCardProps) {
  const router = useRouter();

  const flagged = projectsHealth
    .filter((h) => !h.project.archived && h.status !== "healthy")
    // At risk before watch; within a band, the most overdue work first.
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "at-risk" ? -1 : 1;
      return b.overdueCount + b.blockedCount - (a.overdueCount + a.blockedCount);
    });
  const visible = flagged.slice(0, max);
  const atRisk = flagged.filter((h) => h.status === "at-risk").length;

  return (
    <DashboardCard className="h-full" tone="quiet" interactive={false}>
      <CardHeader
        title="Projects at risk"
        icon={ShieldAlert}
        meta={
          flagged.length > 0 ? (
            <CardEyebrow className={atRisk > 0 ? "text-orbit-red" : "text-orbit-amber"}>
              {flagged.length} flagged
            </CardEyebrow>
          ) : undefined
        }
      />

      {visible.length === 0 ? (
        <CardEmpty
          icon={ShieldAlert}
          title="Every project is on track"
          hint="A project shows here once it has overdue or blocked work."
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {visible.map((health) => (
            <li key={health.project.id}>
              <button
                type="button"
                onClick={() => router.push(`/projects/${health.project.id}`)}
                className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-4 rounded-lg px-2 py-2.5 text-left transition-colors duration-300 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium leading-tight text-ink-muted">
                    {health.project.name}
                  </p>
                  <p className="mt-1 truncate text-[12px] text-ink-dim">{reason(health)}</p>
                </div>
                <StatusChip
                  label={health.status === "at-risk" ? "At risk" : "Watch"}
                  tone={health.status === "at-risk" ? "critical" : "warning"}
                  className="mt-0.5"
                />
              </button>
            </li>
          ))}

          {flagged.length > visible.length && (
            <li className="pt-2 text-[12px] text-ink-dim">
              +{flagged.length - visible.length} more flagged
            </li>
          )}
        </ul>
      )}
    </DashboardCard>
  );
}
