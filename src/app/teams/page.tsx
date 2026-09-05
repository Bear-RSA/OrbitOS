"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Loader } from "@/components/ui/loader";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { AppNav } from "@/components/nav/app-nav";
import { UserAvatar } from "@/components/ui/user-avatar";
import { AddMemberDialog } from "@/components/members/add-member-dialog";
import { DestructiveActionModal } from "@/components/ui/destructive-action-modal";
import { removeMemberAction } from "@/app/actions/members/removeMemberAction";
import { getMembersByOrg } from "@/lib/queries/members";
import { getTasksByOrg } from "@/lib/queries/tasks";
import { getProjectsByOrg } from "@/lib/queries/projects";
import { calculateMemberWorkload } from "@/lib/utils/dashboard-logic";
import { MemberWorkload, WorkloadStatus } from "@/types/dashboard";
import { Task } from "@/types/task";
import { Project } from "@/types/project";
import { UserPlus, UserMinus, RefreshCw, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Teams — the roster, on real people                                 */
/*                                                                     */
/*  This page used to render three hardcoded strangers and three       */
/*  invented agencies, so a workspace looked staffed by people who did */
/*  not exist while the actual operators were only ever visible in the */
/*  dashboard's Operational Load Grid. The grid has moved here: this   */
/*  is now the one place the org's members and their load are shown.   */
/* ------------------------------------------------------------------ */

const statusConfig: Record<
  WorkloadStatus,
  { label: string; text: string; dot: string; weight: number }
> = {
  // Ordered by how much attention the operator needs — `weight` sorts the roster.
  "needs-attention": { label: "Critical Load", text: "text-orbit-red", dot: "bg-orbit-red", weight: 0 },
  heavy: { label: "High Volume", text: "text-orbit-amber", dot: "bg-orbit-amber", weight: 1 },
  balanced: { label: "Optimal Flow", text: "text-orbit-green", dot: "bg-orbit-green", weight: 2 },
  light: { label: "Under Capacity", text: "text-orbit-blue", dot: "bg-orbit-blue", weight: 3 },
};

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

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [revokeMode, setRevokeMode] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);

  // Seat controls are owner-only; createInviteAction and removeMemberAction
  // both re-check the role server-side, so this is presentation, not the
  // security boundary.
  const isOwner = user?.role === "OWNER";

  const load = useCallback(async () => {
    if (!user?.orgId) return;

    try {
      const [orgTasks, orgProjects, members] = await Promise.all([
        getTasksByOrg(user.orgId),
        getProjectsByOrg(user.orgId),
        getMembersByOrg(user.orgId),
      ]);

      setTasks(orgTasks);
      setProjects(orgProjects);
      setWorkloads(members.map((m) => calculateMemberWorkload(m, orgTasks)));
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

  const refresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const projectNames = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const roster = useMemo(
    () =>
      workloads
        .map((workload) => ({
          workload,
          focus: focusFor(workload.member.id, tasks, projectNames),
        }))
        .sort((a, b) => {
          // Owner first, then whoever is carrying the most pressure.
          const aOwner = a.workload.member.role === "OWNER";
          const bOwner = b.workload.member.role === "OWNER";
          if (aOwner !== bOwner) return aOwner ? -1 : 1;

          const byPressure =
            statusConfig[a.workload.status].weight - statusConfig[b.workload.status].weight;
          if (byPressure !== 0) return byPressure;

          return (a.workload.member.name || "").localeCompare(b.workload.member.name || "");
        }),
    [workloads, tasks, projectNames]
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

  const removableCount = useMemo(
    () => workloads.filter((w) => w.member.role !== "OWNER" && w.member.id !== user?.id).length,
    [workloads, user?.id]
  );

  const handleRemove = async (): Promise<{ success: boolean; error?: string }> => {
    if (!memberToRemove || !user?.id) {
      return { success: false, error: "Missing target or session. Re-authenticate and retry." };
    }

    // Client-side OWNER gate — the server action also enforces this.
    if (!isOwner) {
      return { success: false, error: "Unauthorized. Only the Root Owner can revoke node access." };
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
      <div className="min-h-[100dvh] w-full bg-base flex flex-col items-center justify-center gap-6">
        <Loader />
      </div>
    );
  }

  if (!user) return null;

  return (
    <DashboardShell className="bg-base text-ink min-h-screen selection:bg-surface-hover selection:text-ink-strong">
      {/* Top nav */}
      <div className="flex items-center justify-between mb-24 tracking-tight pt-4">
        <div className="flex items-center gap-5 cursor-pointer group" onClick={() => router.push("/dashboard")}>
          <div className="w-10 h-10 rounded-xl bg-surface-control shadow-raised flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-sheen/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none"></div>
            <Image src="/logo.png" alt="OrbitOS Logo" fill className="object-cover rounded-[inherit] z-10" />
          </div>
          <span className="text-[17px] font-medium text-ink tracking-tight group-hover:text-ink-strong transition-colors">OrbitOS</span>
        </div>

        <AppNav uid={user.id} orgId={user.orgId} className="ml-4 mr-auto" />

        <div className="flex items-center gap-5">
          <button
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh roster"
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-full bg-transparent hover:bg-surface-control text-ink-muted hover:text-ink transition-all focus:outline-none ring-0",
              refreshing && "animate-spin text-ink-dim"
            )}
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {isOwner && removableCount > 0 && (
            <button
              onClick={() => setRevokeMode(!revokeMode)}
              className={cn(
                "gap-2.5 hidden sm:flex items-center justify-center rounded-lg px-5 h-10 text-[13px] font-bold tracking-tight transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none ring-0",
                revokeMode
                  ? "bg-orbit-red/12 text-orbit-red ring-1 ring-inset ring-orbit-red/25 hover:bg-orbit-red/20"
                  : "bg-surface-control text-ink-muted hover:bg-surface-hover hover:text-ink"
              )}
            >
              <UserMinus className="w-4 h-4" />
              {revokeMode ? "Done" : "Revoke"}
            </button>
          )}

          {isOwner && (
            <button
              onClick={() => setAddMemberOpen(true)}
              className="gap-2.5 hidden sm:flex items-center justify-center bg-ink hover:bg-ink-strong hover:-translate-y-[2px] text-on-ink shadow-[0_2px_12px_rgb(var(--ink-strong)_/_0.06),0_8px_24px_rgb(var(--scrim)_/_0.3)] hover:shadow-[0_4px_20px_rgb(var(--ink-strong)_/_0.12),0_12px_32px_rgb(var(--scrim)_/_0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-lg px-6 h-10 text-[13px] font-bold tracking-tight focus:outline-none ring-0"
            >
              <UserPlus className="w-4 h-4" />
              Invite Member
            </button>
          )}

          <button
            onClick={() => router.push("/profile")}
            aria-label="Open your profile"
            className="rounded-full transition-transform duration-300 hover:-translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
          >
            <UserAvatar photoURL={user.photoURL} name={user.name} size="md" />
          </button>
        </div>
      </div>

      {/* Header */}
      <ScrollReveal>
        <div className="mb-24">
          <h2 className="text-5xl font-light tracking-tighter text-ink mb-6">Core Team</h2>
          <div className="flex flex-wrap items-center gap-4">
            <div className="px-3 py-1 bg-surface-control rounded-full ring-1 ring-line/[0.04] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-ink-strong shadow-[0_0_8px_rgb(var(--ink-strong)_/_0.4)]" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-ink-muted">Active Deployment</span>
            </div>
            <span className="text-[13px] text-ink-dim font-mono">
              {roster.length} {roster.length === 1 ? "Active Member" : "Active Members"}
            </span>
          </div>
        </div>
      </ScrollReveal>

      {loadError ? (
        <div className="mb-32 flex flex-col items-start gap-5 rounded-3xl bg-surface-sunken p-8 shadow-card ring-1 ring-inset ring-line/[0.06]">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-orbit-amber" aria-hidden />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">Roster unreachable</span>
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
        </div>
      ) : roster.length === 0 ? (
        <div className="mb-32 space-y-2 rounded-3xl bg-surface-sunken p-8 shadow-card ring-1 ring-inset ring-line/[0.06]">
          <p className="text-[15px] font-medium text-ink">Node network inactive.</p>
          <p className="text-[13px] font-light leading-relaxed text-ink-muted">
            Operational load metrics require primary operator assignment.
          </p>
        </div>
      ) : (
        <>
          {/* Roster — every seat in the org, with the load it is carrying */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-32">
            {roster.map(({ workload, focus }, i) => {
              const member = workload.member;
              const config = statusConfig[workload.status];
              const isSelf = member.id === user.id;
              const removable = revokeMode && !isSelf && member.role !== "OWNER";

              return (
                <ScrollReveal key={member.id} delay={i * 100}>
                  <InteractiveCard
                    className={cn(
                      "p-8 group h-full",
                      removable && "ring-1 ring-inset ring-orbit-red/25"
                    )}
                  >
                    {removable && (
                      <button
                        onClick={() => setMemberToRemove(member.id)}
                        aria-label={`Remove ${member.name}`}
                        className="absolute right-5 top-5 z-20 rounded-full bg-orbit-red/12 p-1.5 text-orbit-red transition-colors hover:bg-orbit-red/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-red/50"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}

                    <div className="flex items-start justify-between gap-4 mb-8">
                      <div className="relative shrink-0">
                        <UserAvatar
                          photoURL={member.photoURL}
                          name={member.name}
                          size="xl"
                          className="ring-1 ring-line/[0.08]"
                        />
                        <span
                          className={cn(
                            "absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-4 border-base z-10",
                            config.dot
                          )}
                          aria-hidden
                        />
                      </div>
                      <div className="min-w-0 text-right">
                        <h3 className="truncate text-xl font-light text-ink">
                          {member.name || member.email}
                        </h3>
                        <p className="text-[11px] font-mono text-ink-dim uppercase tracking-widest mt-1">
                          {member.roleDescriptor || (member.role === "OWNER" ? "Root Owner" : "Operator")}
                          {isSelf && " · You"}
                        </p>
                      </div>
                    </div>

                    <div className="mb-8">
                      <p className="text-[10px] font-mono text-ink-faint uppercase tracking-widest mb-4">Focus Module</p>
                      <div className="bg-base/40 rounded-xl p-4 ring-1 ring-line/[0.04]">
                        {focus ? (
                          <>
                            <div className="flex justify-between items-center gap-3 mb-3">
                              <span className="truncate text-[13px] font-light text-ink">{focus.projectName}</span>
                              <span className="shrink-0 text-[11px] font-mono text-ink-strong tabular-nums">{focus.percent}%</span>
                            </div>
                            <div className="w-full h-1 bg-surface-control rounded-full overflow-hidden">
                              <div
                                className="h-full bg-ink-strong rounded-full transition-all duration-1000"
                                style={{ width: `${focus.percent}%` }}
                              />
                            </div>
                            <p className="mt-3 text-[10px] font-mono uppercase tracking-widest text-ink-dim">
                              {focus.done} of {focus.total} closed
                            </p>
                          </>
                        ) : (
                          <p className="text-[13px] font-light text-ink-muted">No work assigned yet.</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3 mb-8">
                      {[
                        { label: "Active", value: workload.metrics.activeTasks, tone: "text-ink" },
                        { label: "Overdue", value: workload.metrics.overdueTasks, tone: workload.metrics.overdueTasks > 0 ? "text-orbit-red" : "text-ink-dim" },
                        { label: "Blocked", value: workload.metrics.blockedTasks, tone: workload.metrics.blockedTasks > 0 ? "text-orbit-amber" : "text-ink-dim" },
                        { label: "Wins", value: workload.metrics.completedThisWeek, tone: workload.metrics.completedThisWeek > 0 ? "text-orbit-green" : "text-ink-dim" },
                      ].map((metric) => (
                        <div key={metric.label} className="flex flex-col gap-1.5">
                          <span className={cn("text-xl font-extralight leading-none tabular-nums", metric.tone)}>
                            {metric.value.toString().padStart(2, "0")}
                          </span>
                          <span className="font-mono text-[9px] uppercase leading-none tracking-[0.14em] text-ink-dim">
                            {metric.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-4 pt-6 border-t border-line/[0.04]">
                      <span className={cn("text-[10px] font-mono uppercase tracking-widest", config.text)}>
                        {config.label}
                      </span>
                      <span className="truncate text-[11px] font-mono text-ink-dim">{member.email}</span>
                    </div>
                  </InteractiveCard>
                </ScrollReveal>
              );
            })}
          </div>

          {/* Stats Footer — measured off the same tasks the cards are drawn from */}
          <ScrollReveal delay={200}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-12 pt-16 border-t border-line/[0.04] pb-32">
              <div>
                <p className="text-[10px] font-mono text-ink-faint uppercase tracking-widest mb-3">Saturation</p>
                <p className="text-4xl font-light tracking-tighter text-ink tabular-nums">{totals.saturation}%</p>
                <p className="mt-2 text-[11px] font-mono text-ink-dim uppercase tracking-widest">Operators at high load</p>
              </div>
              <div>
                <p className="text-[10px] font-mono text-ink-faint uppercase tracking-widest mb-3">Active Load</p>
                <p className="text-4xl font-light tracking-tighter text-ink tabular-nums">{totals.active}</p>
                <p className="mt-2 text-[11px] font-mono text-ink-dim uppercase tracking-widest">
                  {totals.unassigned} unassigned
                </p>
              </div>
              <div>
                <p className="text-[10px] font-mono text-ink-faint uppercase tracking-widest mb-3">Overdue</p>
                <p
                  className={cn(
                    "text-4xl font-light tracking-tighter tabular-nums",
                    totals.overdue > 0 ? "text-orbit-red" : "text-ink"
                  )}
                >
                  {totals.overdue}
                </p>
                <p className="mt-2 text-[11px] font-mono text-ink-dim uppercase tracking-widest">Across the roster</p>
              </div>
              <div>
                <p className="text-[10px] font-mono text-ink-faint uppercase tracking-widest mb-3">Wins This Week</p>
                <p className="text-4xl font-light tracking-tighter text-ink tabular-nums">{totals.wins}</p>
                <p className="mt-2 text-[11px] font-mono text-ink-dim uppercase tracking-widest">Tasks closed</p>
              </div>
            </div>
          </ScrollReveal>
        </>
      )}

      {/* Modals */}
      {isOwner && (
        <>
          <AddMemberDialog
            open={addMemberOpen}
            onOpenChange={setAddMemberOpen}
            orgId={user.orgId || ""}
            invitedBy={user.id}
          />
          <DestructiveActionModal
            isOpen={!!memberToRemove}
            onClose={() => setMemberToRemove(null)}
            onConfirm={handleRemove}
            title="Revoke Node Access"
            entityName={workloads.find((w) => w.member.id === memberToRemove)?.member.name || ""}
            description="You are about to revoke system access for this operator. All active task vectors will be decoupled."
            warningMessage="This execution will trigger an immediate session termination for the target node. All metadata and configuration associated with this node's operational state will be archived but inaccessible."
            actionLabel="Confirm Revocation"
          />
        </>
      )}
    </DashboardShell>
  );
}
