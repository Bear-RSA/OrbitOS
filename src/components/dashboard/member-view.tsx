"use client";

import { MemberDashboardData } from "@/types/dashboard";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { MemberPersonalMetricsCard } from "./member-personal-metrics-card";
import { UrgencyBucketsCard } from "./urgency-buckets-card";
import { TeamWorkloadCard } from "./team-workload-card";
import { WorkspaceProjects } from "./workspace-projects";
import { Member } from "@/types/member";
import { Task } from "@/types/task";

interface MemberDashboardViewProps {
  data: MemberDashboardData;
  members: Member[];
  tasks: Task[];
  orgId: string;
  userId: string;
  onRefresh: () => void;
}

export function MemberDashboardView({ data, members, tasks, orgId, userId, onRefresh }: MemberDashboardViewProps) {
  const myTasks = tasks.filter(t => t.assignedTo.includes(userId));

  return (
    // Matches the owner view's rhythm — the two roles previously used
    // different section gaps for an otherwise identical layout.
    <div className="flex flex-col gap-6 sm:gap-8">
      {/* Personal Metrics Layer */}
      <ScrollReveal>
        <MemberPersonalMetricsCard metrics={data.metrics} />
      </ScrollReveal>

      {/* Personal Urgency Layer */}
      <ScrollReveal delay={100}>
        <UrgencyBucketsCard buckets={data.urgencyBuckets} projects={data.myProjects} />
      </ScrollReveal>

      {/* Team Load Grid — read-only here. No onInviteClick is passed and
          the card hides its revoke control for anyone but the owner. */}
      <ScrollReveal delay={160}>
        <TeamWorkloadCard memberWorkloads={data.teamWorkload} />
      </ScrollReveal>

      {/* Personal Task Queue */}
      <ScrollReveal delay={200}>
        <div className="pt-8">
          <WorkspaceProjects projectsHealth={data.myProjectsHealth} projects={data.myProjects} orgId={orgId} userId={userId} isOwner={false} onRefresh={onRefresh} />
        </div>
      </ScrollReveal>
    </div>
  );
}
