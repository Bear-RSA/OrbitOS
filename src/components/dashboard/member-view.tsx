"use client";

import { MemberDashboardData } from "@/types/dashboard";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { MemberPersonalMetricsCard } from "./member-personal-metrics-card";
import { UrgencyBucketsCard } from "./urgency-buckets-card";
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
  const myTasks = tasks.filter(t => t.assignedTo === userId);

  return (
    <div className="flex flex-col gap-12">
      {/* Personal Metrics Layer */}
      <ScrollReveal>
        <div className="w-full">
          <MemberPersonalMetricsCard metrics={data.metrics} />
        </div>
      </ScrollReveal>

      {/* Personal Urgency Layer */}
      <ScrollReveal delay={100}>
        <div className="pt-4">
          <UrgencyBucketsCard buckets={data.urgencyBuckets} projects={data.myProjects} />
        </div>
      </ScrollReveal>

      {/* Personal Task Queue */}
      <ScrollReveal delay={200}>
        <div className="pt-8 pb-32">
          <WorkspaceProjects projectsHealth={data.myProjectsHealth} projects={data.myProjects} orgId={orgId} userId={userId} isOwner={false} onRefresh={onRefresh} />
        </div>
      </ScrollReveal>
    </div>
  );
}
