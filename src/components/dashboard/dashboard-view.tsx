"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
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

const OVERVIEW_KEY = "orbitos:dashboard-overview";
const SCOPE_KEY = "orbitos:dashboard-scope";

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
  // Remembered per browser, like the overview: whoever works from their
  // own queue should not have to re-pick it on every visit.
  const [scope, setScopeState] = useState<"org" | "mine">("org");
  const showingMine = scope === "mine";
  useEffect(() => {
    try {
      if (window.localStorage.getItem(SCOPE_KEY) === "mine") setScopeState("mine");
    } catch {
      /* Storage blocked: everyone-first is the default anyway. */
    }
  }, []);
  const setScope = (next: "org" | "mine") => {
    setScopeState(next);
    try {
      window.localStorage.setItem(SCOPE_KEY, next);
    } catch {
      /* Storage blocked: the choice still holds for this visit. */
    }
  };

  // One read of today's engagements, shared by the schedule and by presence
  // (which needs it to tell whether someone is currently in a room).
  const { events, failed: eventsFailed } = useTodayEvents(orgId, refreshKey);

  // The overview is reference, not triage, so it starts folded. Whoever
  // opens it keeps it open: remembered per browser, never required.
  const [overviewOpen, setOverviewOpen] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(OVERVIEW_KEY) === "open") setOverviewOpen(true);
    } catch {
      /* Storage blocked: the folded default is fine. */
    }
  }, []);
  const toggleOverview = () => {
    const next = !overviewOpen;
    setOverviewOpen(next);
    try {
      window.localStorage.setItem(OVERVIEW_KEY, next ? "open" : "closed");
    } catch {
      /* Storage blocked: the toggle still works for this visit. */
    }
  };

  /* Order follows the page's promise, "what needs attention right now":
     the Horizon first, then what is stuck and what today holds, then the
     numbers. It used to open on two stat panels and put the Horizon
     fourth, below nine cards of equal weight. */
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {/* Operational Timeline Layer */}
      <ScrollReveal>
        <UrgencyBucketsCard
          buckets={showingMine ? data.myUrgencyBuckets : data.urgencyBuckets}
          projects={showingMine ? data.myProjects : data.projects}
          onTaskClick={(task) => router.push(`/projects/${task.projectId}`)}
          action={
            <div
              role="group"
              aria-label="Show tasks for"
              className="flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-control p-0.5 ring-1 ring-inset ring-line/[0.08]"
            >
              {(["org", "mine"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScope(value)}
                  aria-pressed={scope === value}
                  className={cn(
                    "rounded-[6px] px-2.5 py-1 text-[12px] transition-colors duration-300",
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

      {/* Right Now Layer — what is stuck, what the day holds, and who is
          actually here to deal with it. Schedule and presence read the
          same engagement window. */}
      <ScrollReveal delay={60}>
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
          <BlockedWorkCard items={data.blockedWork} />
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

      {/* Overview — the numbers. Useful for a weekly look, not for
          deciding what to do next, so it sits behind one disclosure. */}
      <section aria-labelledby="dashboard-overview-heading" className="pt-2">
        <button
          type="button"
          onClick={toggleOverview}
          aria-expanded={overviewOpen}
          aria-controls="dashboard-overview"
          className="group flex w-full items-center justify-between gap-4 rounded-xl px-1 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span>
            <span id="dashboard-overview-heading" className="block text-[15px] font-medium text-ink">
              Overview
            </span>
            <span className="mt-0.5 block text-[13px] text-ink-muted">
              Workspace health, your week, and recent wins
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "h-4 w-4 shrink-0 text-ink-muted transition-transform duration-quick ease-spring group-hover:text-ink",
              overviewOpen && "rotate-180"
            )}
          />
        </button>

        {overviewOpen && (
          <div id="dashboard-overview" className="mt-4 flex flex-col gap-6 animate-fade-in">
            <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
              <WorkspaceAttentionCard metrics={data.metrics} hasProject={hasProject} />
              <SystemHealthCard tasks={tasks} hasProject={hasProject} />
            </div>
            <PersonalMetricsCard metrics={data.personal} />
            <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
              <WeeklyProgressCard
                weeklyProgress={data.weeklyProgress}
                completedThisWeek={data.metrics.completedThisWeek}
              />
              <RecentWinsCard wins={data.recentWins} />
            </div>
          </div>
        )}
      </section>

      {/* Projects in Focus — at most two, ranked by how soon their next
          unfinished task is due, so overdue work leads. Absent entirely
          when nothing in the workspace carries a due date: an unranked
          wall of project cards was the thing this replaced.

          The full listing, the archive shelf and priority reordering all
          live on /projects, which is the only place that sees every
          project and can therefore renumber them safely. */}
      {data.focusProjects.length > 0 && (
        <ScrollReveal delay={260}>
          <div className="pt-8">
            <WorkspaceProjects
              projectsHealth={data.focusProjects}
              title="Projects in focus"
              eyebrow="Nearest deadlines"
              orgId={orgId}
              userId={userId}
              isOwner={isOwner}
              allowReorder={false}
              showArchiveShelf={false}
              onRefresh={onRefresh}
            />
          </div>
        </ScrollReveal>
      )}
    </div>
  );
}
