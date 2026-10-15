"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OrbitLoader } from "@/components/brand/orbit-loader";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { AppHeader } from "@/components/nav/app-header";
import { UserAvatar } from "@/components/ui/user-avatar";
import { AddMemberDialog } from "@/components/members/add-member-dialog";
import { MemberProfile } from "@/components/members/member-profile";
import { DestructiveActionModal } from "@/components/ui/destructive-action-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { OrgTree } from "@/components/teams/org-tree";
import { WORKLOAD_STATUS } from "@/components/teams/workload-status";
import { ManageMemberDialog } from "@/components/members/manage-member-dialog";
import { DepartmentDialog } from "@/components/members/department-dialog";
import { removeMemberAction } from "@/app/actions/members/removeMemberAction";
import {
  deleteDepartmentAction,
  getTeamStructureAction,
  type TeamStructure,
} from "@/app/actions/team-structure";
import { buildOrgTree } from "@/lib/members/hierarchy";
import { memberDisplayName } from "@/lib/members/profile";
import type { Department } from "@/types/department";
import { getOrCreateDmAction } from "@/app/actions/messages";
import { getMembersByOrg } from "@/lib/queries/members";
import { getTasksByOrg } from "@/lib/queries/tasks";
import { getProjectsByOrg } from "@/lib/queries/projects";
import { calculateMemberWorkload } from "@/lib/utils/dashboard-logic";
import { MemberWorkload } from "@/types/dashboard";
import { Task } from "@/types/task";
import { Project } from "@/types/project";
import {
  UserPlus,
  UserMinus,
  RefreshCw,
  X,
  AlertTriangle,
  FolderPlus,
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

  const [addMemberOpen, setAddMemberOpen] = useState(false);
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
  const [departmentDialog, setDepartmentDialog] = useState<{ open: boolean; department: Department | null }>({
    open: false,
    department: null,
  });
  const [departmentToDelete, setDepartmentToDelete] = useState<Department | null>(null);
  const [deletingDepartment, setDeletingDepartment] = useState(false);

  // Two ways to look at the same roster. Not persisted: Tree is the default.
  const [view, setView] = useState<TeamView>("tree");

  // Seat controls are owner-only; createInviteAction and removeMemberAction
  // both re-check the role server-side, so this is presentation, not the
  // security boundary.
  const isOwner = user?.role === "OWNER";
  const isAccountHolder = structure?.viewerIsAccountHolder ?? false;

  const load = useCallback(async () => {
    if (!user?.orgId) return;

    try {
      const [orgTasks, orgProjects, members, structureResult] = await Promise.all([
        getTasksByOrg(user.orgId),
        getProjectsByOrg(user.orgId),
        getMembersByOrg(user.orgId),
        getTeamStructureAction(),
      ]);

      setTasks(orgTasks);
      setProjects(orgProjects);
      setWorkloads(members.map((m) => calculateMemberWorkload(m, orgTasks)));
      setStructure(structureResult.success ? structureResult.structure : null);
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

  const tree = useMemo(
    () =>
      structure
        ? buildOrgTree(
            workloads.map((w) => w.member),
            structure.departments,
            structure.accountHolderId
          )
        : null,
    [workloads, structure]
  );

  const statusByUid = useMemo(
    () => new Map(workloads.map((w) => [w.member.id, w.status])),
    [workloads]
  );

  const deleteDepartment = async () => {
    if (!departmentToDelete) return;
    setDeletingDepartment(true);
    try {
      const result = await deleteDepartmentAction({ departmentId: departmentToDelete.id });
      if (result.success) {
        setDepartmentToDelete(null);
        await load();
      } else {
        setDepartmentToDelete(null);
        setMessageError(result.error);
      }
    } catch (err) {
      console.error("[Teams] Could not delete the department:", err);
      setDepartmentToDelete(null);
      setMessageError("Could not delete the department. Try again.");
    } finally {
      setDeletingDepartment(false);
    }
  };

  const removableCount = useMemo(
    () =>
      workloads.filter(
        // Owners are removable only by the account holder.
        (w) => (w.member.role !== "OWNER" || isAccountHolder) && w.member.id !== user?.id
      ).length,
    [workloads, user?.id, isAccountHolder]
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
              reads as an action on the team rather than page chrome. */}
          {isOwner && (
            <div className="mt-8 flex flex-wrap items-center gap-4">
              {removableCount > 0 && view === "roster" && (
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

              <button
                onClick={() => setAddMemberOpen(true)}
                className="gap-2.5 flex items-center justify-center bg-ink hover:bg-ink-strong hover:-translate-y-[2px] text-on-ink shadow-[0_2px_12px_rgb(var(--ink-strong)_/_0.06),0_8px_24px_rgb(var(--scrim)_/_0.3)] hover:shadow-[0_4px_20px_rgb(var(--ink-strong)_/_0.12),0_12px_32px_rgb(var(--scrim)_/_0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-lg px-6 h-10 text-[13px] font-bold tracking-tight focus:outline-none ring-0"
              >
                <UserPlus className="w-4 h-4" />
                Invite Member
              </button>
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
          <p className="text-[15px] font-medium text-ink">No one on the team yet.</p>
          <p className="text-[13px] font-light leading-relaxed text-ink-muted">
            Workload shows up here once people join and get tasks assigned.
          </p>
        </GlassSurface>
      ) : (
        <>
          {/* Tree: who answers to whom */}
          {view === "tree" && !(tree && structure) && (
            <p className="mb-32 text-[13px] font-light text-ink-muted">
              Could not load the team structure. The roster is unaffected. Try again in a moment.
            </p>
          )}
          {view === "tree" && tree && structure && (
            <ScrollReveal>
              <section className="mb-32" aria-labelledby="structure-heading">
                <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
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

                  {isOwner &&
                    structure.departments.length > 0 &&
                    (structure.departmentLimit > 0 ? (
                      <button
                        onClick={() => setDepartmentDialog({ open: true, department: null })}
                        disabled={structure.departments.length >= structure.departmentLimit}
                        className="flex h-10 items-center justify-center gap-2.5 rounded-lg bg-surface-control px-5 text-[13px] font-bold tracking-tight text-ink transition-colors hover:bg-surface-hover disabled:opacity-50"
                      >
                        <FolderPlus className="h-4 w-4" />
                        New department
                      </button>
                    ) : (
                      <p className="max-w-xs text-[12px] leading-relaxed text-ink-dim">
                        Departments are on the Pro and Custom plans.
                      </p>
                    ))}
                </div>

                <OrgTree
                  tree={tree}
                  viewerId={user.id}
                  statusOf={(uid) => statusByUid.get(uid)}
                  canManageDepartments={isOwner}
                  accountHolderId={structure.accountHolderId}
                  canManageOwners={isAccountHolder}
                  departmentLimit={structure.departmentLimit}
                  onOpenProfile={setProfileUid}
                  onManage={setManageUid}
                  onCreateDepartment={() => setDepartmentDialog({ open: true, department: null })}
                  onRenameDepartment={(department) => setDepartmentDialog({ open: true, department })}
                  onDeleteDepartment={setDepartmentToDelete}
                />
              </section>
            </ScrollReveal>
          )}

          {view === "roster" && (
            <>
              {/* Roster — every seat in the org, with the load it is carrying */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-32">
                {roster.map(({ workload, focus }, i) => {
                  const member = workload.member;
                  const config = statusConfig[workload.status];
                  const isSelf = member.id === user.id;
                  const removable =
                    revokeMode && !isSelf && (member.role !== "OWNER" || isAccountHolder);

                  return (
                    <ScrollReveal key={member.id} delay={i * 100}>
                      <InteractiveCard
                        surface="fog"
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
                          <button
                            type="button"
                            onClick={() => setProfileUid(member.id)}
                            aria-label={`View ${memberDisplayName(member)}'s profile`}
                            className="relative shrink-0 rounded-full transition-transform duration-300 hover:-translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
                          >
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
                          </button>
                          <div className="min-w-0 text-right">
                            <h3 className="truncate text-xl font-light text-ink">
                              {memberDisplayName(member)}
                            </h3>
                            <p className="text-[12px] text-ink-dim mt-1">
                              {member.roleDescriptor ||
                                (member.id === structure?.accountHolderId
                                  ? "Account holder"
                                  : member.role === "OWNER"
                                    ? "Owner"
                                    : "Member")}
                              {isSelf && " · You"}
                            </p>
                          </div>
                        </div>

                        <div className="mb-8">
                          <p className="text-[12px] text-ink-dim mb-4">Focus</p>
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
                                <p className="mt-3 text-[12px] text-ink-dim">
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
                              <span className="text-[12px] leading-none text-ink-dim">
                                {metric.label}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between gap-4 pt-6 border-t border-line/[0.04]">
                          <span className={cn("text-[12px]", config.text)}>
                            {config.label}
                          </span>
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
          onMessage={openDm}
        />
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
            title="Remove from workspace?"
            entityName={workloads.find((w) => w.member.id === memberToRemove)?.member.name || ""}
            description="They lose access to this workspace straight away."
            warningMessage="Their tasks stay, but they're unassigned from them. You can invite them back later."
            actionLabel="Remove member"
          />
          {structure && (
            <ManageMemberDialog
              member={manageUid ? (workloads.find((w) => w.member.id === manageUid)?.member ?? null) : null}
              structure={structure}
              viewerIsAccountHolder={isAccountHolder}
              onClose={() => setManageUid(null)}
              onChanged={load}
              onRemove={setMemberToRemove}
            />
          )}
          <DepartmentDialog
            open={departmentDialog.open}
            department={departmentDialog.department}
            onClose={() => setDepartmentDialog({ open: false, department: null })}
            onSaved={load}
          />
          <ConfirmDialog
            open={!!departmentToDelete}
            onOpenChange={(open) => !open && setDepartmentToDelete(null)}
            title={`Delete ${departmentToDelete?.name ?? "department"}?`}
            description="The people in it stay in the workspace and move to Not in a department."
            confirmText="Delete department"
            variant="destructive"
            loading={deletingDepartment}
            onConfirm={deleteDepartment}
          />
        </>
      )}
    </DashboardShell>
  );
}
