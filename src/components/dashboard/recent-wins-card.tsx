"use client";

import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { RecentWin } from "@/types/dashboard";
import { formatRelativeTime } from "@/lib/utils/dates";
import { DashboardCard, CardHeader, CardEyebrow } from "./dashboard-card";

interface RecentWinsCardProps {
  wins: RecentWin[];
}

export function RecentWinsCard({ wins }: RecentWinsCardProps) {
  const router = useRouter();

  return (
    <DashboardCard className="h-full" tone="quiet" interactive={false}>
      <CardHeader
        title="Recent Wins"
        icon={Trophy}
        meta={<CardEyebrow>{wins.length > 0 ? `Last ${wins.length}` : "None yet"}</CardEyebrow>}
      />

      {wins.length === 0 ? (
        <div className="flex flex-1 flex-col justify-end space-y-2">
          <p className="text-[14px] font-medium text-ink">No recent wins.</p>
          <p className="text-[13px] font-light leading-relaxed text-ink-muted">
            Completed directives stream here as they land.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {wins.map((win) => (
            <li key={win.task.id}>
              <button
                type="button"
                onClick={() => router.push(`/projects/${win.task.projectId}`)}
                className="group/win -mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors duration-300 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orbit-green/60 transition-colors group-hover/win:bg-orbit-green"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium leading-tight text-ink-muted transition-colors group-hover/win:text-ink-strong">
                    {win.task.title}
                  </span>
                  <span className="mt-1.5 block truncate font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
                    {win.assigneeName} · {formatRelativeTime(win.completedAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
