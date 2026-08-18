"use client";

import { OwnerDashboardData } from "@/types/dashboard";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { OwnerAttentionCard } from "./owner-attention-card";
import { SystemHealthCard } from "./system-health-card";
import { UrgencyBucketsCard } from "./urgency-buckets-card";
import { TeamWorkloadCard } from "./team-workload-card";
import { WorkspaceProjects } from "./workspace-projects";
import { Member } from "@/types/member";
import { Task } from "@/types/task";

interface OwnerDashboardViewProps {
  data: OwnerDashboardData;
  members: Member[];
  tasks: Task[];
  orgId: string;
  userId: string;
  onRefresh: () => void;
  onInviteClick?: () => void;
}

export function OwnerDashboardView({ data, members, tasks, orgId, userId, onRefresh, onInviteClick }: OwnerDashboardViewProps) {
  const hasProject = data.projectsHealth.length > 0;

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

      {/* Operational Timeline Layer */}
      <ScrollReveal delay={80}>
        <UrgencyBucketsCard buckets={data.urgencyBuckets} projects={data.projectsHealth.map(ph => ph.project)} />
      </ScrollReveal>

      {/* Team Load Grid */}
      <ScrollReveal delay={160}>
        <TeamWorkloadCard memberWorkloads={data.teamWorkload} onInviteClick={onInviteClick} />
      </ScrollReveal>

      {/* Projects Overview */}
      <ScrollReveal delay={200}>
        <div className="pt-8">
          <WorkspaceProjects projectsHealth={data.projectsHealth} orgId={orgId} userId={userId} isOwner={true} onRefresh={onRefresh} />
        </div>
      </ScrollReveal>
    </div>
  );
}
