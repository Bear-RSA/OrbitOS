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
  onRefresh: () => void;
  onInviteClick?: () => void;
}

export function OwnerDashboardView({ data, members, tasks, orgId, onRefresh, onInviteClick }: OwnerDashboardViewProps) {
  const hasProject = data.projectsHealth.length > 0;

  return (
    <div className="flex flex-col gap-14">
      {/* Risk and Attention Layer */}
      <ScrollReveal>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <OwnerAttentionCard metrics={data.metrics} hasProject={hasProject} />
          <SystemHealthCard tasks={tasks} hasProject={hasProject} />
        </div>
      </ScrollReveal>

      {/* Operational Timeline Layer */}
      <ScrollReveal delay={80}>
        <div className="pt-4">
          <UrgencyBucketsCard buckets={data.urgencyBuckets} projects={data.projectsHealth.map(ph => ph.project)} />
        </div>
      </ScrollReveal>

      {/* Team Load Grid */}
      <ScrollReveal delay={160}>
        <div className="pt-4">
          <TeamWorkloadCard memberWorkloads={data.teamWorkload} onInviteClick={onInviteClick} />
        </div>
      </ScrollReveal>

      {/* Projects Overview */}
      <ScrollReveal delay={200}>
        <div className="pt-4 pb-32">
          <WorkspaceProjects projectsHealth={data.projectsHealth} />
        </div>
      </ScrollReveal>
    </div>
  );
}
