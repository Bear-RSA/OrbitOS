"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OrbitLoader } from "@/components/brand/orbit-loader";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { AppHeader } from "@/components/nav/app-header";
import { UserAvatar } from "@/components/ui/user-avatar";
import { MemberProfile } from "@/components/members/member-profile";
import { DestructiveActionModal } from "@/components/ui/destructive-action-modal";
import { OrgChartMirror } from "@/components/teams/org-chart-mirror";
import { departmentShade } from "@/components/ui/department-glass";
import { layOutChart } from "@/lib/members/chart-layout";
import { tintOf, type DepartmentTint } from "@/lib/members/department-tint";
import { getOrgChartAction, type OrgChart } from "@/app/actions/org-chart";
import { WORKLOAD_STATUS } from "@/components/teams/workload-status";
import { ManageMemberDialog } from "@/components/members/manage-member-dialog";
import { removeMemberAction } from "@/app/actions/members/removeMemberAction";
import {
  getTeamStructureAction,
  type TeamStructure,
} from "@/app/actions/team-structure";
import { RANK_LABEL, rankLevel, rankOf } from "@/lib/members/rank";
import type { Member } from "@/types/member";
import { memberDisplayName } from "@/lib/members/profile";
import { getOrCreateDmAction } from "@/app/actions/messages";
import { getMembersByOrg, subscribeToMembersByOrg } from "@/lib/queries/members";
import { presenceLabel, presenceOfMember, presenceTone, type Presence } from "@/lib/members/presence";
import { useNow } from "@/hooks/use-now";
import { getTasksByOrg } from "@/lib/queries/tasks";
import { getProjectsByOrg } from "@/lib/queries/projects";
import { calculateMemberWorkload } from "@/lib/utils/dashboard-logic";
import { MemberWorkload } from "@/types/dashboard";
import { Task } from "@/types/task";
import { Project } from "@/types/project";
import {
  UserMinus,
  RefreshCw,
  X,
  AlertTriangle,
  LayoutGrid,
  Network,
} from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import { GlassSurface } from "@/components/ui/glass-surface";

/* ------------------------------------------------------------------ */
/*  Teams — the roster, on real people                                 */
/*                                                                     */
/*  This page used to render three hardcoded strangers and three       */
/*  invented agencies, so a workspace looked staffed by people who did */
/*  not exist while the actual operators were only ever visible in the */
/*  dashboard's Operational Load Grid. The grid has moved here: this   */
/*  is now the one place the org's members and their load are shown.   */
/* ------------------------------------------------------------------ */

const statusConfig = WORKLOAD_STATUS;

type TeamView = "roster" | "tree";

const VIEWS = [
  { id: "tree", icon: Network, label: "Tree" },
  { id: "roster", icon: LayoutGrid, label: "Roster" },
] as const;

interface OperatorFocus {
  projectName: string;
  percent: number;
  done: number;
  total: number;
}

/**
 * The project an operator is most invested in right now.
 *
 * Picked by open task count rather than total, so a project they finished
 * last month does not stay pinned to their card. `percent` is their own
 * completion inside that project, not the project's overall health.
 */
function focusFor(
  memberId: string,
  tasks: Task[],
  projectNames: Map<string, string>
): OperatorFocus | null {
  const mine = tasks.filter((t) => t.assignedTo.includes(memberId));
  if (mine.length === 0) return null;

  const byProject = new Map<string, { total: number; done: number; active: number }>();
  for (const task of mine) {
    const entry = byProject.get(task.projectId) ?? { total: 0, done: 0, active: 0 };
    entry.total += 1;
    if (task.status === "done") entry.done += 1;
    else entry.active += 1;
    byProject.set(task.projectId, entry);
  }

  let bestId: string | null = null;
  let best = { total: 0, done: 0, active: 0 };
  for (const [projectId, entry] of byProject) {
    const beatsBest =
      entry.active > best.active ||
      (entry.active === best.active && entry.total > best.total);
    if (beatsBest) {
      bestId = projectId;
      best = entry;
    }
  }
  if (!bestId) return null;

  return {
    projectName: projectNames.get(bestId) ?? "Unknown Project",
    percent: best.total > 0 ? Math.round((best.done / best.total) * 100) : 0,
    done: best.done,
    total: best.total,
  };
}

export default function TeamsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [workloads, setWorkloads] = useState<MemberWorkload[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [revokeMode, setRevokeMode] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);

  // The same read-only card Messages and the project Personnel Hub open —
  // a face is a face everywhere in the app.
  const [profileUid, setProfileUid] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);

  // Who owns the workspace and how it is arranged. Null while loading, or
  // when the read failed, in which case the roster still shows and only
  // the tree is missing.
  const [structure, setStructure] = useState<TeamStructure | null>(null);
  const [manageUid, setManageUid] = useState<string | null>(null);
  // The org chart Internal Management wires up in Admin Tools.
  const [chart, setChart] = useState<OrgChart | null>(null);

  // Two ways to look at the same roster. Not persisted: Tree is the default.
  const [view, setView] = useState<TeamView>("tree");

  // Removing members is for owners; inviting happens only in Admin Tools.
  // removeMemberAction re-checks on the server, so this is presentation,
  // not the security boundary.
  const isOwner = user?.role === "OWNER";
  // The viewer is in Internal Management. Only then is the page told who
  // else is (`structure.internalManagementIds`).
  const isInternalManagement = structure?.viewerIsInternalManagement ?? false;
  // Managers name leads and Executives give ranks, so they open the Manage
  // dialog too. It shows each viewer only what they can change, and every
  // action re-checks on the server.
  const canManagePeople =
    isOwner || (structure?.viewerCanAppointLeads ?? false) || (structure?.assignableRanks.length ?? 0) > 0;

  const leadIds = useMemo(
    () => new Set(structure?.departments.flatMap((d) => (d.leadId ? [d.leadId] : [])) ?? []),
    [structure]
  );
  const rankOfMember = useCallback((member: Member) => rankOf(member.role, leadIds.has(member.id)), [leadIds]);

  const load = useCallback(async () => {
    if (!user?.orgId) return;

    try {
      const [orgTasks, orgProjects, members, structureResult, chartResult] = await Promise.all([
        getTasksByOrg(user.orgId),
        getProjectsByOrg(user.orgId),
        getMembersByOrg(user.orgId),
        getTeamStructureAction(),
        getOrgChartAction(),
      ]);

      setTasks(orgTasks);
      setProjects(orgProjects);
      setWorkloads(members.map((m) => calculateMemberWorkload(m, orgTasks)));
      setStructure(structureResult.success ? structureResult.structure : null);
      setChart(chartResult.success ? chartResult.chart : null);
      setLoadError(false);
    } catch (err) {
      console.error("[Teams] Failed to resolve the roster:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.orgId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    load();
  }, [authLoading, user, router, load]);

  /* The structure is changed in Admin Tools, usually in another tab.
     Coming back to this one picks up whatever Internal Management did
     there, rather than showing the tree as it was when Teams first opened. */
  useEffect(() => {
    if (!user?.orgId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [user?.orgId, load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const projectNames = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const onlyViewer = workloads.length === 1 && workloads[0].member.id === user?.id;

  // Empty unless the viewer is in Internal Management themselves.
  const internalManagementIds = useMemo(
    () => new Set(structure?.internalManagementIds ?? []),
    [structure]
  );

  /* Each person's department shade, the same one the chart gives them:
     their card's tint where they're on it, otherwise the department
     they're filed in. */
  const tintByPerson = useMemo(() => {
    const tints = new Map<string, DepartmentTint>();
    if (!chart) return tints;
    for (const card of layOutChart(chart)) {
      if (card.kind !== "DEPARTMENT" && card.tint) tints.set(card.person.id, card.tint);
    }
    const departments = new Map(chart.departments.map((d) => [d.id, d]));
    for (const person of chart.people) {
      const filed = person.departmentId ? departments.get(person.departmentId) : undefined;
      if (!tints.has(person.id) && filed) tints.set(person.id, tintOf(filed));
    }
    return tints;
  }, [chart]);

  const roster = useMemo(
    () =>
      workloads
        .map((workload) => ({
          workload,
          focus: focusFor(workload.member.id, tasks, projectNames),
        }))
        .sort((a, b) => {
          // Internal Management first, for those allowed to know who that is.
          const aIm = internalManagementIds.has(a.workload.member.id);
          const bIm = internalManagementIds.has(b.workload.member.id);
          if (aIm !== bIm) return aIm ? -1 : 1;

          // Then highest rank, then whoever is carrying the most pressure.
          const byRank =
            rankLevel(rankOfMember(b.workload.member)) - rankLevel(rankOfMember(a.workload.member));
          if (byRank !== 0) return byRank;

          const byPressure =
            statusConfig[a.workload.status].weight - statusConfig[b.workload.status].weight;
          if (byPressure !== 0) return byPressure;

          return (a.workload.member.name || "").localeCompare(b.workload.member.name || "");
        }),
    [workloads, tasks, projectNames, rankOfMember, internalManagementIds]
  );

  const totals = useMemo(() => {
    const sum = (pick: (w: MemberWorkload) => number) =>
      workloads.reduce((n, w) => n + pick(w), 0);

    const strained = workloads.filter(
      (w) => w.status === "heavy" || w.status === "needs-attention"
    ).length;

    return {
      active: sum((w) => w.metrics.activeTasks),
      overdue: sum((w) => w.metrics.overdueTasks),
      wins: sum((w) => w.metrics.completedThisWeek),
      saturation: workloads.length > 0 ? Math.round((strained / workloads.length) * 100) : 0,
      unassigned: tasks.filter((t) => t.status !== "done" && t.assignedTo.length === 0).length,
    };
  }, [workloads, tasks]);

  /* Presence is live: the roster above is read once, so its copy of
     `lastActivity` would freeze at page load. This listener follows the
     heartbeat as it lands, and the clock lets a pulse go stale on its
     own when someone closes the laptop. */
  const [liveMembers, setLiveMembers] = useState<Member[] | null>(null);
  useEffect(() => {
    if (!user?.orgId) return;
    return subscribeToMembersByOrg(user.orgId, setLiveMembers);
  }, [user?.orgId]);
  const now = useNow();

  const presenceByUid = useMemo(() => {
    const source = liveMembers && liveMembers.length > 0 ? liveMembers : workloads.map((w) => w.member);
    return new Map<string, Presence>(source.map((m) => [m.id, presenceOfMember(m, now)]));
  }, [liveMembers, workloads, now]);

  /* The roster by id: the chart carries names and ranks, the roster
     carries descriptors and presence for the cards. */
  const memberById = useMemo(
    () => new Map(workloads.map((w) => [w.member.id, w.member])),
    [workloads]
  );

  const removableCount = useMemo(
    () =>
      workloads.filter(
        // Owners are removable only by Internal Management.
        (w) => (w.member.role !== "OWNER" || isInternalManagement) && w.member.id !== user?.id
      ).length,
    [workloads, user?.id, isInternalManagement]
  );

  /**
   * Message from the profile card.
   *
   * The dm may not exist yet, and /messages only deep-links by
   * conversation id, so the thread is resolved here first and the page is
   * handed a real id. The card has already closed itself by the time this
   * runs, which is why a failure needs somewhere on the page to land.
   */
  const openDm = useCallback(
    async (targetUid: string) => {
      setMessageError(null);
      try {
        const result = await getOrCreateDmAction({ targetUid });
        if (result.success) {
          router.push(`/messages?c=${result.conversationId}`);
        } else {
          setMessageError(result.error);
        }
      } catch (err) {
        console.error("[Teams] Could not open the conversation:", err);
        setMessageError("Could not open that conversation. Try again from Messages.");
      }
    },
    [router]
  );

  const handleRemove = async (): Promise<{ success: boolean; error?: string }> => {
    if (!memberToRemove || !user?.id) {
      return { success: false, error: "Missing target or session. Re-authenticate and retry." };
    }

    // Client-side OWNER gate — the server action also enforces this.
    if (!isOwner) {
      return { success: false, error: "Only the workspace owner can remove members." };
    }

    try {
      const result = await removeMemberAction({ targetUserId: memberToRemove, uid: user.id });

      if (result.success) {
        setMemberToRemove(null);
        if (removableCount <= 1) setRevokeMode(false);
        await load();
      }

      // Always return the result so the modal can surface errors inline.
      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred during revocation.";
      console.error("[Revoke Node Access]:", message);
      return { success: false, error: message };
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-[100dvh] w-full bg-ground flex flex-col items-center justify-center gap-6">
        <OrbitLoader />
      </div>
    );
  }

  if (!user) return null;

  return (
    <DashboardShell className="bg-ground text-ink min-h-screen selection:bg-surface-hover selection:text-ink-strong">
      {/* Top nav */}
      <AppHeader user={user} />

      {/* Header */}
      <ScrollReveal>
        <div className="mb-24">
          <h1 className="text-5xl font-light tracking-tighter text-ink mb-6">Team</h1>
          <div className="flex flex-wrap items-center gap-4">
            <div className="px-3 py-1 bg-surface-control rounded-full ring-1 ring-line/[0.04] flex items-center gap-2">
              <span className="text-[12px] text-ink-muted">Active</span>
            </div>
            <span className="text-[13px] text-ink-dim font-mono">
              {roster.length} {roster.length === 1 ? "Active Member" : "Active Members"}
            </span>
          </div>

          {/* Same look as the project view switcher, so a switch reads as a switch. */}
          <div
            role="tablist"
            aria-label="Team views"
            className="mt-8 inline-flex items-center gap-1 rounded-xl bg-surface-card p-1 ring-1 ring-inset ring-line/[0.06]"
          >
            {VIEWS.map(({ id, icon: Icon, label }) => {
              const active = view === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(id)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] tracking-[0.18em]",
                    "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                    active
                      ? "bg-surface-hover text-ink ring-1 ring-inset ring-line/[0.09]"
                      : "text-ink-dim hover:bg-surface-raised hover:text-ink-muted"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Seat management sits under the roster status line, where it
              reads as an action on the team rather than page chrome.
              Owners remove members. Invites are sent from Admin Tools only. */}
          {isOwner && (
            <div className="mt-8 flex flex-wrap items-center gap-4">
              {isOwner && removableCount > 0 && view === "roster" && (
                <button
                  onClick={() => setRevokeMode(!revokeMode)}
                  className={cn(
                    "gap-2.5 flex items-center justify-center rounded-lg px-5 h-10 text-[13px] font-bold tracking-tight transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none ring-0",
                    revokeMode
                      ? "bg-orbit-red/12 text-orbit-red ring-1 ring-inset ring-orbit-red/25 hover:bg-orbit-red/20"
                      : "bg-surface-control text-ink-muted hover:bg-surface-hover hover:text-ink"
                  )}
                >
                  <UserMinus className="w-4 h-4" />
                  {revokeMode ? "Done" : "Remove members"}
                </button>
              )}
            </div>
          )}
        </div>
      </ScrollReveal>

      {messageError && (
        <GlassSurface
          fallback="material-fog [--fog-base:var(--surface-sunken)]"
          tint="surface-sunken"
          className="mb-10 flex items-start justify-between gap-4 rounded-2xl px-6 py-4 ring-1 ring-inset ring-orbit-amber/20"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-orbit-amber" aria-hidden />
            <p className="text-[13px] font-light text-ink-muted">{messageError}</p>
          </div>
          <button
            onClick={() => setMessageError(null)}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-1 text-ink-faint transition-colors hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </GlassSurface>
      )}

      {loadError ? (
        <GlassSurface
          fallback="material-fog [--fog-base:var(--surface-sunken)]"
          tint="surface-sunken"
          className="mb-32 flex flex-col items-start gap-5 rounded-3xl border border-line/[0.06] p-8 shadow-raised ring-1 ring-line/5"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-orbit-amber" aria-hidden />
            <span className="text-[12px] text-ink-dim">Couldn&apos;t load the team</span>
          </div>
          <div className="space-y-2">
            <p className="text-[15px] font-medium text-ink">Could not load your team.</p>
            <p className="max-w-prose text-[13px] font-light leading-relaxed text-ink-muted">
              This is a read failure, not an empty workspace — no seat has been lost. Try again in a moment.
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex h-10 items-center gap-2.5 rounded-lg bg-surface-control px-5 text-[13px] font-bold tracking-tight text-ink transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </GlassSurface>
      ) : roster.length === 0 ? (
        <GlassSurface
          fallback="material-fog [--fog-base:var(--surface-sunken)]"
          tint="surface-sunken"
          className="mb-32 rounded-3xl border border-line/[0.06] p-8 shadow-raised ring-1 ring-line/5"
          contentClassName="space-y-2"
        >
          <p className="text-[15px] font-medium text-ink">Your team will be in here</p>
          <p className="max-w-prose text-[13px] font-light leading-relaxed text-ink-muted">
            {isInternalManagement ? (
              <>
                Invite people from{" "}
                <Link href="/admin" className="text-ink underline underline-offset-4 hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-sm">
                  Admin Tools
                </Link>
                . They show up here, with their workload, as soon as they join.
              </>
            ) : (
              "People show up here, with their workload, once Internal Management invites them."
            )}
          </p>
        </GlassSurface>
      ) : (
        <>
          {/* A new workspace is just the viewer. Their own card still shows
              below; this says where everyone else will appear. */}
          {onlyViewer && (
        <GlassSurface
          fallback="material-fog [--fog-base:var(--surface-sunken)]"
          tint="surface-sunken"
          className="mb-10 rounded-3xl border border-line/[0.06] p-8 shadow-raised ring-1 ring-line/5"
          contentClassName="space-y-2"
        >
          <p className="text-[15px] font-medium text-ink">Your team will be in here</p>
          <p className="max-w-prose text-[13px] font-light leading-relaxed text-ink-muted">
            {isInternalManagement ? (
              <>
                Invite people from{" "}
                <Link href="/admin" className="text-ink underline underline-offset-4 hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-sm">
                  Admin Tools
                </Link>
                . They show up here, with their workload, as soon as they join.
              </>
            ) : (
              "People show up here, with their workload, once Internal Management invites them."
            )}
          </p>
        </GlassSurface>
          )}
          {/* Tree: who answers to whom, as wired in Admin Tools */}
          {view === "tree" && !structure && (
            <p className="mb-32 text-[13px] font-light text-ink-muted">
              Could not load the team structure. The roster is unaffected. Try again in a moment.
            </p>
          )}
          {view === "tree" && structure && (
            <ScrollReveal>
              <section className="mb-32" aria-labelledby="structure-heading">
                <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
                  <div>
                    <h2 id="structure-heading" className="text-2xl font-light tracking-tight text-ink">
                      Structure
                    </h2>
                    <p className="mt-2 font-mono text-[13px] text-ink-dim tabular-nums">
                      Owners {structure.ownerSeats.current} /{" "}
                      {structure.ownerSeats.limit === -1 ? "∞" : structure.ownerSeats.limit}
                      {" · "}
                      {structure.departments.length}{" "}
                      {structure.departments.length === 1 ? "department" : "departments"}
                    </p>
                  </div>
                  {isInternalManagement && (
                    <p className="max-w-xs text-[12px] leading-relaxed text-ink-dim">
                      Change the structure in Admin Tools.
                    </p>
                  )}
                </div>

                {/* The Admin Tools chart, card for card, where Internal
                    Management placed it. */}
                {chart ? (
                  <OrgChartMirror
                    chart={chart}
                    memberById={memberById}
                    viewerId={user.id}
                    presenceOf={(uid) => presenceByUid.get(uid)}
                    rankOf={rankOfMember}
                    canManage={(member) =>
                      member.id !== user.id &&
                      (member.role === "OWNER" ? isInternalManagement : canManagePeople)
                    }
                    onOpenProfile={setProfileUid}
                    onManage={setManageUid}
                  />
                ) : (
                  <p className="text-[13px] font-light text-ink-muted">
                    Could not load the chart. The roster is unaffected. Try again in a moment.
                  </p>
                )}
              </section>
            </ScrollReveal>
          )}

          {view === "roster" && (
            <>
              {/* Roster — every seat in the org, with the load it is carrying */}
              <div className="mb-24 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {roster.map(({ workload, focus }, i) => {
                  const member = workload.member;
                  const config = statusConfig[workload.status];
                  const presence = presenceByUid.get(member.id) ?? "offline";
                  const isSelf = member.id === user.id;
                  const removable =
                    revokeMode && !isSelf && (member.role !== "OWNER" || isInternalManagement);
                  const { activeTasks, overdueTasks, blockedTasks, completedThisWeek } = workload.metrics;

                  const shade = departmentShade(tintByPerson.get(member.id) ?? null);

                  return (
                    <ScrollReveal key={member.id} delay={Math.min(i, 6) * 60}>
                      {/* Their department's shade, as on the chart. The card
                          takes no style, so it sits in a layer behind it. */}
                      <div
                        style={shade.style}
                        className={cn("h-full rounded-[24px]", shade.className && cn("ring-1 ring-inset", shade.className))}
                      >
                      <InteractiveCard
                        surface="fog"
                        className={cn(
                          "group h-full p-5",
                          removable && "ring-1 ring-inset ring-orbit-red/25"
                        )}
                      >
                        {/* Identity: face, name, and the load reading as a pill */}
                        <div className="flex items-center gap-3.5">
                          <button
                            type="button"
                            onClick={() => setProfileUid(member.id)}
                            aria-label={`View ${memberDisplayName(member)}'s profile`}
                            className="relative shrink-0 rounded-xl transition-transform duration-300 hover:-translate-y-[2px] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
                          >
                            <UserAvatar
                              photoURL={member.photoURL}
                              name={member.name}
                              size="lg"
                              rank={rankOfMember(member)}
                              uid={member.id}
                              className={rankOfMember(member) === "MEMBER" ? "ring-1 ring-line/[0.08]" : undefined}
                            />
                            <span
                              className={cn(
                                "absolute -bottom-0.5 -right-0.5 z-10 h-3 w-3 rounded-full border-[2.5px] border-base",
                                presenceTone(presence)
                              )}
                              title={presenceLabel(presence)}
                              role="img"
                              aria-label={presenceLabel(presence)}
                            />
                          </button>

                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-[15px] font-medium tracking-tight text-ink">
                              {memberDisplayName(member)}
                            </h3>
                            <p className="mt-0.5 truncate text-[12px] text-ink-dim">
                              {member.roleDescriptor ||
                                (internalManagementIds.has(member.id)
                                  ? "Internal Management"
                                  : RANK_LABEL[rankOfMember(member)])}
                              {isSelf && " · You"}
                            </p>
                          </div>

                          {removable ? (
                            <button
                              onClick={() => setMemberToRemove(member.id)}
                              aria-label={`Remove ${member.name}`}
                              className="z-20 shrink-0 rounded-full bg-orbit-red/12 p-1.5 text-orbit-red transition-colors hover:bg-orbit-red/25 active:bg-orbit-red/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-red/50"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <span
                              className={cn(
                                "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-control/60 px-2 py-0.5 text-[11px] ring-1 ring-inset ring-line/[0.06]",
                                config.text
                              )}
                            >
                              <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
                              {config.label}
                            </span>
                          )}
                        </div>

                        {/* Focus: the project carrying most of their open work */}
                        <div className="mt-5">
                          <div className="mb-2 flex items-baseline justify-between gap-3">
                            <span className={cn("truncate text-[12px]", focus ? "text-ink-muted" : "text-ink-dim")}>
                              {focus ? focus.projectName : "No work assigned yet"}
                            </span>
                            {focus && (
                              <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-dim">
                                {focus.done}/{focus.total}
                                <span className="ml-1.5 text-ink-strong">{focus.percent}%</span>
                              </span>
                            )}
                          </div>
                          <div className="h-[3px] w-full overflow-hidden rounded-full bg-surface-control">
                            <div
                              className="h-full rounded-full bg-ink-strong transition-all duration-1000"
                              style={{ width: `${focus?.percent ?? 0}%` }}
                            />
                          </div>
                        </div>

                        {/* Load: four counts in one strip */}
                        <div className="mt-4 grid grid-cols-4 divide-x divide-line/[0.05] rounded-xl bg-base/40 py-2.5 ring-1 ring-inset ring-line/[0.04]">
                          {[
                            { label: "Active", value: activeTasks, tone: "text-ink" },
                            { label: "Overdue", value: overdueTasks, tone: overdueTasks > 0 ? "text-orbit-red" : "text-ink-dim" },
                            { label: "Blocked", value: blockedTasks, tone: blockedTasks > 0 ? "text-orbit-amber" : "text-ink-dim" },
                            { label: "Wins", value: completedThisWeek, tone: completedThisWeek > 0 ? "text-orbit-green" : "text-ink-dim" },
                          ].map((metric) => (
                            <div key={metric.label} className="flex flex-col items-center gap-1">
                              <span className={cn("text-[17px] font-light leading-none tabular-nums", metric.tone)}>
                                {metric.value}
                              </span>
                              <span className="text-[11px] leading-none text-ink-dim">{metric.label}</span>
                            </div>
                          ))}
                        </div>
                      </InteractiveCard>
                      </div>
                    </ScrollReveal>
                  );
                })}
              </div>

              {/* Stats Footer — measured off the same tasks the cards are drawn from */}
              <ScrollReveal delay={200}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-12 pt-16 border-t border-line/[0.04] pb-32">
                  <div>
                    <p className="text-[12px] text-ink-dim mb-3">Saturation</p>
                    <p className="text-4xl font-light tracking-tighter text-ink tabular-nums">{totals.saturation}%</p>
                    <p className="mt-2 text-[12px] text-ink-dim">People at high load</p>
                  </div>
                  <div>
                    <p className="text-[12px] text-ink-dim mb-3">Active Load</p>
                    <p className="text-4xl font-light tracking-tighter text-ink tabular-nums">{totals.active}</p>
                    <p className="mt-2 text-[12px] text-ink-dim">
                      {totals.unassigned} unassigned
                    </p>
                  </div>
                  <div>
                    <p className="text-[12px] text-ink-dim mb-3">Overdue</p>
                    <p
                      className={cn(
                        "text-4xl font-light tracking-tighter tabular-nums",
                        totals.overdue > 0 ? "text-orbit-red" : "text-ink"
                      )}
                    >
                      {totals.overdue}
                    </p>
                    <p className="mt-2 text-[12px] text-ink-dim">Across the roster</p>
                  </div>
                  <div>
                    <p className="text-[12px] text-ink-dim mb-3">Wins This Week</p>
                    <p className="text-4xl font-light tracking-tighter text-ink tabular-nums">{totals.wins}</p>
                    <p className="mt-2 text-[12px] text-ink-dim">Tasks closed</p>
                  </div>
                </div>
              </ScrollReveal>
            </>
          )}
        </>
      )}

      {/* Tapping any face on the roster opens the same read-only card the
          Messages rail and the project Personnel Hub open. Tasks are
          already in hand here, so the card costs no extra read for them;
          engagements it fetches itself, on open rather than on load. */}
      {user.orgId && (
        <MemberProfile
          member={profileUid ? (workloads.find((w) => w.member.id === profileUid)?.member ?? null) : null}
          onClose={() => setProfileUid(null)}
          viewer={{ id: user.id, orgId: user.orgId }}
          tasks={tasks}
          chart={chart}
          projectNames={projectNames}
          onMessage={openDm}
        />
      )}

      {/* Modals */}
      {structure && canManagePeople && (
        <ManageMemberDialog
          member={manageUid ? (workloads.find((w) => w.member.id === manageUid)?.member ?? null) : null}
          structure={structure}
          viewerRole={user.role}
          viewerIsInternalManagement={isInternalManagement}
          onClose={() => setManageUid(null)}
          onChanged={load}
          onRemove={setMemberToRemove}
        />
      )}
      {isOwner && (
        <>
          <DestructiveActionModal
            isOpen={!!memberToRemove}
            onClose={() => setMemberToRemove(null)}
            onConfirm={handleRemove}
            title="Remove from workspace?"
            entityName={workloads.find((w) => w.member.id === memberToRemove)?.member.name || ""}
            description="They lose access to this workspace straight away."
            warningMessage="Their tasks stay, but they're unassigned from them. You can invite them back later."
            actionLabel="Remove member"
          />
        </>
      )}
    </DashboardShell>
  );
}
