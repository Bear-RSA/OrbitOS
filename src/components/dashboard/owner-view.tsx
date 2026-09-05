"use client";

import { useRouter } from "next/navigation";
import { DashboardActivityItem, OwnerDashboardData } from "@/types/dashboard";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { OwnerAttentionCard } from "./owner-attention-card";
import { SystemHealthCard } from "./system-health-card";
import { UrgencyBucketsCard } from "./urgency-buckets-card";
import { TeamWorkloadCard } from "./team-workload-card";
import { WorkspaceProjects } from "./workspace-projects";
import { TodayScheduleCard } from "./today-schedule-card";
import { ActivityFeedCard } from "./activity-feed-card";
import { BlockedWorkCard } from "./blocked-work-card";
import { WeeklyProgressCard } from "./weekly-progress-card";
import { RecentWinsCard } from "./recent-wins-card";
import { Member } from "@/types/member";
import { Task } from "@/types/task";

interface OwnerDashboardViewProps {
  data: OwnerDashboardData;
  members: Member[];
  tasks: Task[];
  orgId: string;
  userId: string;
  activity: DashboardActivityItem[];
  activityError: string | null;
  clock24h: boolean;
  refreshKey: number;
  onRefresh: () => void;
  onInviteClick?: () => void;
}

export function OwnerDashboardView({
  data,
  members,
  tasks,
  orgId,
  userId,
  activity,
  activityError,
  clock24h,
  refreshKey,
  onRefresh,
  onInviteClick,
}: OwnerDashboardViewProps) {
  const router = useRouter();
  const hasProject = data.projectsHealth.length > 0;
  const projects = data.projectsHealth.map((ph) => ph.project);

  return (
    // Single rhythm token for the whole column; sections no longer add their
    // own ad-hoc `pt-4` on top of the container gap.
    <div className="flex flex-col gap-6 sm:gap-8">
      {/* Risk and Attention Layer */}
      <ScrollReveal>
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
          <OwnerAttentionCard metrics={data.metrics} hasProject={hasProject} />
          <SystemHealthCard tasks={tasks} hasProject={hasProject} />
        </div>
      </ScrollReveal>

      {/* Time and History Layer — the two axes the dashboard never had */}
      <ScrollReveal delay={60}>
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
          <TodayScheduleCard
            orgId={orgId}
            uid={userId}
            members={members}
            scope="org"
            clock24h={clock24h}
            refreshKey={refreshKey}
          />
          <ActivityFeedCard items={activity} error={activityError} />
        </div>
      </ScrollReveal>

      {/* Operational Timeline Layer */}
      <ScrollReveal delay={120}>
        <UrgencyBucketsCard
          buckets={data.urgencyBuckets}
          projects={projects}
          onTaskClick={(task) => router.push(`/projects/${task.projectId}`)}
        />
      </ScrollReveal>

      {/* Momentum and Obstruction Layer */}
      <ScrollReveal delay={160}>
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
          <WeeklyProgressCard
            weeklyProgress={data.weeklyProgress}
            completedThisWeek={data.metrics.completedThisWeek}
          />
          <RecentWinsCard wins={data.recentWins} />
          <BlockedWorkCard items={data.blockedWork} />
        </div>
      </ScrollReveal>

      {/* Team Load Grid */}
      <ScrollReveal delay={200}>
        <TeamWorkloadCard memberWorkloads={data.teamWorkload} onInviteClick={onInviteClick} />
      </ScrollReveal>

      {/* Projects Overview */}
      <ScrollReveal delay={240}>
        <div className="pt-8">
          <WorkspaceProjects projectsHealth={data.projectsHealth} orgId={orgId} userId={userId} isOwner={true} onRefresh={onRefresh} />
        </div>
      </ScrollReveal>
    </div>
  );
}
