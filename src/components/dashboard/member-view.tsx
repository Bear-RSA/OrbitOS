"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardActivityItem, MemberDashboardData } from "@/types/dashboard";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { MemberPersonalMetricsCard } from "./member-personal-metrics-card";
import { UrgencyBucketsCard } from "./urgency-buckets-card";
import { TeamWorkloadCard } from "./team-workload-card";
import { WorkspaceProjects } from "./workspace-projects";
import { TodayScheduleCard } from "./today-schedule-card";
import { ActivityFeedCard } from "./activity-feed-card";
import { WeeklyProgressCard } from "./weekly-progress-card";
import { RecentWinsCard } from "./recent-wins-card";
import { Member } from "@/types/member";
import { cn } from "@/lib/utils/classnames";

interface MemberDashboardViewProps {
  data: MemberDashboardData;
  members: Member[];
  orgId: string;
  userId: string;
  activity: DashboardActivityItem[];
  activityError: string | null;
  clock24h: boolean;
  refreshKey: number;
  onRefresh: () => void;
}

export function MemberDashboardView({
  data,
  members,
  orgId,
  userId,
  activity,
  activityError,
  clock24h,
  refreshKey,
  onRefresh,
}: MemberDashboardViewProps) {
  const router = useRouter();

  // The Horizon used to render org-wide buckets unconditionally, so a member
  // scanning "their" overdue column was reading other people's work. Their own
  // queue is the default now; the org view stays one click away.
  const [scope, setScope] = useState<"mine" | "org">("mine");
  const showingMine = scope === "mine";

  return (
    // Matches the owner view's rhythm — the two roles previously used
    // different section gaps for an otherwise identical layout.
    <div className="flex flex-col gap-6 sm:gap-8">
      {/* Personal Metrics Layer */}
      <ScrollReveal>
        <MemberPersonalMetricsCard metrics={data.metrics} />
      </ScrollReveal>

      {/* Time and History Layer */}
      <ScrollReveal delay={60}>
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
          <TodayScheduleCard
            orgId={orgId}
            uid={userId}
            members={members}
            scope="mine"
            clock24h={clock24h}
            refreshKey={refreshKey}
          />
          <ActivityFeedCard items={activity} error={activityError} />
        </div>
      </ScrollReveal>

      {/* Personal Urgency Layer */}
      <ScrollReveal delay={120}>
        <UrgencyBucketsCard
          buckets={showingMine ? data.myUrgencyBuckets : data.urgencyBuckets}
          projects={showingMine ? data.myProjects : data.orgProjects}
          onTaskClick={(task) => router.push(`/projects/${task.projectId}`)}
          action={
            <div
              role="group"
              aria-label="Horizon scope"
              className="flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-control p-0.5 ring-1 ring-inset ring-line/[0.08]"
            >
              {(["mine", "org"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScope(value)}
                  aria-pressed={scope === value}
                  className={cn(
                    "rounded-[6px] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors duration-300",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                    scope === value
                      ? "bg-surface-hover text-ink"
                      : "text-ink-dim hover:text-ink-muted"
                  )}
                >
                  {value === "mine" ? "Mine" : "Everyone"}
                </button>
              ))}
            </div>
          }
        />
      </ScrollReveal>

      {/* Momentum Layer */}
      <ScrollReveal delay={160}>
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
          <WeeklyProgressCard
            weeklyProgress={data.weeklyProgress}
            completedThisWeek={data.metrics.myCompletedThisWeek}
          />
          <RecentWinsCard wins={data.recentWins} />
        </div>
      </ScrollReveal>

      {/* Team Load Grid — read-only here. No onInviteClick is passed and
          the card hides its revoke control for anyone but the owner. */}
      <ScrollReveal delay={200}>
        <TeamWorkloadCard memberWorkloads={data.teamWorkload} />
      </ScrollReveal>

      {/* Personal Task Queue */}
      <ScrollReveal delay={240}>
        <div className="pt-8">
          <WorkspaceProjects projectsHealth={data.myProjectsHealth} projects={data.myProjects} orgId={orgId} userId={userId} isOwner={false} onRefresh={onRefresh} />
        </div>
      </ScrollReveal>
    </div>
  );
}
