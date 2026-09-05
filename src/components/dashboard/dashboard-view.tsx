"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardData } from "@/types/dashboard";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { useTodayEvents } from "@/hooks/use-today-events";
import { WorkspaceAttentionCard } from "./workspace-attention-card";
import { SystemHealthCard } from "./system-health-card";
import { PersonalMetricsCard } from "./personal-metrics-card";
import { UrgencyBucketsCard } from "./urgency-buckets-card";
import { WorkspaceProjects } from "./workspace-projects";
import { TodayScheduleCard } from "./today-schedule-card";
import { TeamPresenceCard } from "./team-presence-card";
import { BlockedWorkCard } from "./blocked-work-card";
import { WeeklyProgressCard } from "./weekly-progress-card";
import { RecentWinsCard } from "./recent-wins-card";
import { Member } from "@/types/member";
import { Task } from "@/types/task";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  The dashboard — one layout for the whole org                       */
/*                                                                     */
/*  This replaces owner-view.tsx and member-view.tsx, which rendered   */
/*  two different dashboards from two different assemblies. A member   */
/*  had no system health, no blocked work, no workspace metrics and    */
/*  only the projects they were assigned to, so two people in the same */
/*  workspace could not talk about "the dashboard" and mean the same   */
/*  thing.                                                             */
/*                                                                     */
/*  Everyone in an org now sees the same operational picture. `isOwner` */
/*  gates write controls only — project reordering and restoring — and  */
/*  each of those is enforced again in its server action.               */
/*                                                                     */
/*  The roster lives on /teams, not here. It used to be duplicated:    */
/*  the Operational Load Grid at the bottom of this page listed the     */
/*  real members while /teams showed hardcoded placeholders, so the     */
/*  page people went to for the team was the one telling the truth      */
/*  least.                                                             */
/* ------------------------------------------------------------------ */

interface DashboardViewProps {
  data: DashboardData;
  members: Member[];
  tasks: Task[];
  orgId: string;
  userId: string;
  clock24h: boolean;
  refreshKey: number;
  onRefresh: () => void;
}

export function DashboardView({
  data,
  members,
  tasks,
  orgId,
  userId,
  clock24h,
  refreshKey,
  onRefresh,
}: DashboardViewProps) {
  const router = useRouter();
  const isOwner = data.role === "OWNER";
  const hasProject = data.projectsHealth.length > 0;

  // Everyone lands on the workspace-wide Horizon. Narrowing to your own
  // queue is a filter on the shared view, not a different dashboard.
  const [scope, setScope] = useState<"org" | "mine">("org");
  const showingMine = scope === "mine";

  // One read of today's engagements, shared by the schedule and by presence
  // (which needs it to tell whether someone is currently in a room).
  const { events, failed: eventsFailed } = useTodayEvents(orgId, refreshKey);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {/* Risk and Attention Layer */}
      <ScrollReveal>
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
          <WorkspaceAttentionCard metrics={data.metrics} hasProject={hasProject} />
          <SystemHealthCard tasks={tasks} hasProject={hasProject} />
        </div>
      </ScrollReveal>

      {/* Personal Layer — the one strip that is yours rather than the org's */}
      <ScrollReveal delay={60}>
        <PersonalMetricsCard metrics={data.personal} />
      </ScrollReveal>

      {/* Right Now Layer — what the day holds, and who is actually here
          to deal with it. Both read the same engagement window. */}
      <ScrollReveal delay={100}>
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
          <TodayScheduleCard
            events={events}
            failed={eventsFailed}
            uid={userId}
            members={members}
            scope="org"
            clock24h={clock24h}
          />
          <TeamPresenceCard
            members={members}
            events={events}
            viewerId={userId}
            clock24h={clock24h}
          />
        </div>
      </ScrollReveal>

      {/* Operational Timeline Layer */}
      <ScrollReveal delay={140}>
        <UrgencyBucketsCard
          buckets={showingMine ? data.myUrgencyBuckets : data.urgencyBuckets}
          projects={showingMine ? data.myProjects : data.projects}
          onTaskClick={(task) => router.push(`/projects/${task.projectId}`)}
          action={
            <div
              role="group"
              aria-label="Horizon scope"
              className="flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-control p-0.5 ring-1 ring-inset ring-line/[0.08]"
            >
              {(["org", "mine"] as const).map((value) => (
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
                  {value === "org" ? "Everyone" : "Mine"}
                </button>
              ))}
            </div>
          }
        />
      </ScrollReveal>

      {/* Momentum and Obstruction Layer */}
      <ScrollReveal delay={180}>
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
          <WeeklyProgressCard
            weeklyProgress={data.weeklyProgress}
            completedThisWeek={data.metrics.completedThisWeek}
          />
          <RecentWinsCard wins={data.recentWins} />
          <BlockedWorkCard items={data.blockedWork} />
        </div>
      </ScrollReveal>

      {/* Projects Overview — every project in the workspace, for every seat.
          Reordering and restoring remain owner-only inside the component. */}
      <ScrollReveal delay={260}>
        <div className="pt-8">
          <WorkspaceProjects
            projectsHealth={data.projectsHealth}
            orgId={orgId}
            userId={userId}
            isOwner={isOwner}
            onRefresh={onRefresh}
          />
        </div>
      </ScrollReveal>
    </div>
  );
}
