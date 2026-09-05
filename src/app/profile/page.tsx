"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  DashboardCard,
  CardHeader,
  CardEyebrow,
  StatBlock,
  StatusChip,
  MeterBar,
  ActionButton,
} from "@/components/dashboard/dashboard-card";
import { Loader } from "@/components/ui/loader";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { getTasksByOrg } from "@/lib/queries/tasks";
import { getProjectsByOrg } from "@/lib/queries/projects";
import { db } from "@/lib/firebase/client";
import { doc, updateDoc } from "firebase/firestore";
import { signOut as firebaseSignOut } from "@/lib/firebase/auth";
import { Task } from "@/types/task";
import { Project } from "@/types/project";
import { User } from "@/types/auth";
import { isAfter, isSameDay, startOfWeek, format } from "date-fns";
import {
  RefreshCw,
  Mail,
  LogOut,
  Check,
  Activity,
  FolderKanban,
  Lock,
  Minus,
  ChevronRight,
  CalendarDays,
  ShieldCheck,
  UserRound,
  Crown,
  Users,
  HardDriveUpload,
  Settings as SettingsIcon,
} from "lucide-react";
import { AppNav } from "@/components/nav/app-nav";
import { cn } from "@/lib/utils/classnames";
import { ProfilePictureManager } from "@/components/profile/profile-picture-manager";
import { themeColor } from "@/lib/theme/colors";

/**
 * `roleDescriptor` and `bio` are profile-only fields written straight to the
 * user document; they are not part of the auth-critical `User` shape, so they
 * are widened here rather than with a scattering of `as any` casts.
 */
type ProfileUser = User & { roleDescriptor?: string; bio?: string };

// ─── Workload Status Computation ───────────────────────────────────────────

type WorkloadStatus = "light" | "balanced" | "heavy" | "critical";

function computeWorkload(active: number, overdue: number): WorkloadStatus {
  if (overdue > 3 || active > 10) return "critical";
  if (overdue > 1 || active > 6) return "heavy";
  if (active > 2) return "balanced";
  return "light";
}

/**
 * Pressure reads on the same semantic palette as the dashboard health cards —
 * a "heavy" load here is the same amber it is over there.
 */
const WORKLOAD_CONFIG: Record<
  WorkloadStatus,
  {
    label: string;
    tone: "neutral" | "positive" | "warning" | "critical";
    bar: string;
    fill: number;
    note: string;
  }
> = {
  light: {
    label: "Light",
    tone: "neutral",
    bar: themeColor.inkDim,
    fill: 22,
    note: "Capacity available.",
  },
  balanced: {
    label: "Balanced",
    tone: "positive",
    bar: themeColor.green,
    fill: 48,
    note: "Load is sustainable.",
  },
  heavy: {
    label: "Heavy",
    tone: "warning",
    bar: themeColor.amber,
    fill: 76,
    note: "Approaching capacity.",
  },
  critical: {
    label: "Critical",
    tone: "critical",
    bar: themeColor.red,
    fill: 100,
    note: "Overcommitted — rebalance work.",
  },
};

// ─── Capability Matrix ─────────────────────────────────────────────────────

const OWNER_CAPABILITIES = [
  { label: "Create & Delete Projects", granted: true },
  { label: "Invite Team Members", granted: true },
  { label: "Manage All Org Tasks", granted: true },
  { label: "View Team Workload", granted: true },
  { label: "Edit Own Profile", granted: true },
  { label: "Account Security Controls", granted: true },
];

const MEMBER_CAPABILITIES = [
  { label: "Create & Delete Projects", granted: false },
  { label: "Invite Team Members", granted: false },
  { label: "Manage Assigned Tasks", granted: true },
  { label: "View Team Workload", granted: false },
  { label: "Edit Own Profile", granted: true },
  { label: "Account Security Controls", granted: true },
];

// ─── Form Primitives ───────────────────────────────────────────────────────

const FIELD_CLASS =
  "w-full rounded-xl bg-surface-raised px-4 text-[14px] font-light text-ink ring-1 ring-inset ring-line/[0.06] " +
  "placeholder:text-ink-dim transition-[background-color,box-shadow] duration-300 " +
  "hover:bg-surface-control focus:bg-surface-control focus:outline-none focus:ring-focus";

/** Label row: field name on the left, its mutability on the right. */
function FieldLabel({
  htmlFor,
  label,
  locked = false,
}: {
  htmlFor?: string;
  label: string;
  locked?: boolean;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-4">
      <label
        htmlFor={htmlFor}
        className="font-mono text-[10px] uppercase leading-none tracking-[0.18em] text-ink-dim"
      >
        {label}
      </label>
      <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-dim">
        {locked && <Lock className="h-2.5 w-2.5 text-ink-faint" aria-hidden />}
        {locked ? "System" : "Editable"}
      </span>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const { user: authUser, loading: authLoading } = useAuth();
  const user = authUser as ProfileUser | null;

  // Data state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form state (editable fields only)
  const [name, setName] = useState("");
  const [roleDescriptor, setRoleDescriptor] = useState("");
  const [bio, setBio] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Security state
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Load operational data
  const loadData = useCallback(async () => {
    if (!user?.orgId) return;
    try {
      const [taskData, projectData] = await Promise.allSettled([
        getTasksByOrg(user.orgId),
        getProjectsByOrg(user.orgId),
      ]);
      setTasks(taskData.status === "fulfilled" ? taskData.value : []);
      setProjects(projectData.status === "fulfilled" ? projectData.value : []);
    } catch (err) {
      console.error("Profile data load failed", err);
    } finally {
      setDataLoading(false);
      setRefreshing(false);
    }
  }, [user?.orgId]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else {
        setName(user.name || "");
        setRoleDescriptor(user.roleDescriptor || "");
        setBio(user.bio || "");
        loadData();
      }
    }
  }, [authLoading, user, router, loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const handleSave = async () => {
    if (!user || isSaving) return;
    const hasChanges =
      name.trim() !== user.name ||
      roleDescriptor !== (user.roleDescriptor || "") ||
      bio !== (user.bio || "");
    if (!hasChanges || !name.trim()) return;

    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await updateDoc(doc(db, "users", user.id), {
        name: name.trim(),
        roleDescriptor: roleDescriptor.trim(),
        bio: bio.trim(),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error("Profile save failed", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await firebaseSignOut();
      router.push("/login");
    } catch (err) {
      console.error("Sign out failed", err);
    } finally {
      setIsSigningOut(false);
    }
  };

  if (authLoading || dataLoading) {
    return (
      <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-base">
        <Loader />
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">
            Resolving Profile
          </span>
          <div className="h-px w-24 bg-gradient-to-r from-transparent via-line/15 to-transparent" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  // ── Operational metrics (role-aware) ──────────────────────────────────────
  const isOwner = user.role === "OWNER";
  const RoleIcon = isOwner ? Crown : Users;
  const now = new Date();
  const weekStart = startOfWeek(now);

  const relevantTasks = isOwner
    ? tasks
    : tasks.filter((t) => t.assignedTo.includes(user.id));

  const activeTasks = relevantTasks.filter((t) => t.status !== "done");
  const overdueTasks = activeTasks.filter(
    (t) =>
      t.dueDate &&
      isAfter(now, t.dueDate.toDate()) &&
      !isSameDay(now, t.dueDate.toDate())
  );
  const completedThisWeek = relevantTasks.filter(
    (t) =>
      t.status === "done" &&
      t.completedAt &&
      isAfter(t.completedAt.toDate(), weekStart)
  );

  const workloadStatus = computeWorkload(activeTasks.length, overdueTasks.length);
  const workloadCfg = WORKLOAD_CONFIG[workloadStatus];

  // ── Projects involved ─────────────────────────────────────────────────────
  const involvedProjectIds = new Set(relevantTasks.map((t) => t.projectId));
  const involvedProjects = isOwner
    ? projects
    : projects.filter((p) => involvedProjectIds.has(p.id));

  // ── Save gate ─────────────────────────────────────────────────────────────
  const hasChanges =
    name.trim() !== user.name ||
    roleDescriptor !== (user.roleDescriptor || "") ||
    bio !== (user.bio || "");

  const capabilities = isOwner ? OWNER_CAPABILITIES : MEMBER_CAPABILITIES;
  const grantedCount = capabilities.filter((c) => c.granted).length;
  const joinDate = user.createdAt?.toDate
    ? format(user.createdAt.toDate(), "MMM yyyy")
    : "—";

  // The header live-previews what is being typed, so the identity block and the
  // form never disagree while an edit is in flight.
  const displayName = name.trim() || user.name;
  const displayDescriptor = roleDescriptor.trim();
  const displayBio = bio.trim();

  return (
    <DashboardShell className="min-h-[100dvh] bg-base text-ink selection:bg-surface-hover selection:text-ink-strong">
      {/* ── Chrome ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 -mx-5 mb-10 border-b border-line/[0.05] bg-base/80 px-5 backdrop-blur-xl sm:-mx-8 sm:mb-14 sm:px-8 lg:-mx-10 lg:px-10">
        <div className="flex h-16 items-center justify-between gap-4 tracking-tight">
          {/* Replaces a lone "back to Dashboard" button: every destination is
              now reachable from every page, not just the one behind you. */}
          <AppNav uid={user?.id} orgId={user?.orgId} />

          <div className="flex items-center gap-2">
            {hasChanges && (
              <span className="mr-1 hidden items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-dim sm:inline-flex">
                <span className="urgency-breath h-1.5 w-1.5 rounded-full bg-orbit-amber" />
                Unsaved
              </span>
            )}

            <ActionButton
              icon={RefreshCw}
              label="Refresh"
              variant="ghost"
              collapsed
              disabled={refreshing}
              onClick={handleRefresh}
              className={cn(refreshing && "[&_svg]:animate-spin")}
            />

            {/* Settings lives off the profile: it is account-scoped, and this
                is the only page every role reaches it from. */}
            <ActionButton
              icon={SettingsIcon}
              label="Settings"
              collapsed
              onClick={() => router.push("/settings")}
            />

            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges || !name.trim()}
              aria-label="Save profile changes"
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-3.5 text-on-ink",
                "shadow-[0_2px_12px_rgb(var(--ink-strong)_/_0.06)]",
                "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                "hover:-translate-y-px hover:bg-ink-strong",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base",
                "disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:bg-ink"
              )}
            >
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {isSaving ? (
                  <Loader size={14} stroke={2.5} color={themeColor.onInk} />
                ) : saveSuccess ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <HardDriveUpload className="h-3.5 w-3.5" aria-hidden />
                )}
              </span>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em]">
                {isSaving ? "Saving" : saveSuccess ? "Saved" : "Save"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-6 sm:gap-8">
        {/* ══ Identity ═══════════════════════════════════════════════════ */}
        <ScrollReveal>
          <DashboardCard interactive={false} className="p-8 sm:p-10">
            {/* Ambient light behind the avatar — gives the hero a source */}
            <div
              aria-hidden
              className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-surface-raised blur-3xl"
            />

            <div className="relative flex flex-col gap-8 sm:flex-row sm:items-center sm:gap-10">
              <ProfilePictureManager user={user} />

              <div className="min-w-0 flex-1 space-y-5">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusChip label={user.role} icon={RoleIcon} tone="neutral" />
                    {displayDescriptor && (
                      <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                        {displayDescriptor}
                      </span>
                    )}
                  </div>
                  <h1 className="text-[clamp(2rem,4.5vw,2.75rem)] font-extralight leading-none tracking-tight text-ink">
                    {displayName}
                  </h1>
                </div>

                {displayBio && (
                  <p className="max-w-xl text-[14px] font-light leading-relaxed text-ink-muted">
                    {displayBio}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-x-7 gap-y-2.5 pt-1">
                  <span className="inline-flex min-w-0 items-center gap-2.5">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                    <span className="truncate font-mono text-[12px] text-ink-muted">
                      {user.email}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-2.5">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                    <span className="font-mono text-[12px] text-ink-muted">
                      Member since {joinDate}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </DashboardCard>
        </ScrollReveal>

        {/* ══ Operational Overview ═══════════════════════════════════════ */}
        <ScrollReveal delay={80}>
          <DashboardCard interactive={false}>
            <CardHeader
              title={isOwner ? "Workspace Overview" : "Operational Overview"}
              icon={Activity}
              meta={
                <StatusChip
                  label={`${workloadCfg.label} Load`}
                  icon={Activity}
                  tone={workloadCfg.tone}
                />
              }
            />

            <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
              <StatBlock
                size="md"
                label="Active Tasks"
                value={String(activeTasks.length).padStart(2, "0")}
                tone={activeTasks.length === 0 ? "idle" : "default"}
              />
              <StatBlock
                size="md"
                label="Overdue"
                value={String(overdueTasks.length).padStart(2, "0")}
                tone={overdueTasks.length > 0 ? "critical" : "idle"}
              />
              <StatBlock
                size="md"
                label="Done This Week"
                value={String(completedThisWeek.length).padStart(2, "0")}
                tone={completedThisWeek.length > 0 ? "positive" : "idle"}
              />
              <StatBlock
                size="md"
                label={isOwner ? "Org Projects" : "My Projects"}
                value={String(involvedProjects.length).padStart(2, "0")}
                tone={involvedProjects.length === 0 ? "idle" : "default"}
              />
            </div>

            {/* Pressure */}
            <div className="mt-8 border-t border-line/[0.05] pt-6">
              <div className="mb-3 flex items-center justify-between gap-4">
                <CardEyebrow>Pressure</CardEyebrow>
                <span className="text-[12px] font-light text-ink-muted">
                  {workloadCfg.note}
                </span>
              </div>
              <MeterBar value={workloadCfg.fill} color={workloadCfg.bar} />
            </div>
          </DashboardCard>
        </ScrollReveal>

        {/* ══ Account & Capabilities ═════════════════════════════════════ */}
        <ScrollReveal delay={140}>
          <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
            {/* Account Information */}
            <DashboardCard interactive={false} className="h-full">
              <CardHeader
                title="Account Information"
                icon={UserRound}
                meta={
                  hasChanges ? (
                    <StatusChip label="Modified" tone="warning" />
                  ) : (
                    <StatusChip label="Synced" icon={Check} tone="neutral" />
                  )
                }
              />

              <div className="flex flex-1 flex-col gap-6">
                <div>
                  <FieldLabel htmlFor="profile-name" label="Full Name" />
                  <input
                    id="profile-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={cn(FIELD_CLASS, "h-12")}
                  />
                </div>

                <div>
                  <FieldLabel htmlFor="profile-descriptor" label="Descriptor" />
                  <input
                    id="profile-descriptor"
                    value={roleDescriptor}
                    onChange={(e) => setRoleDescriptor(e.target.value)}
                    placeholder="e.g. Lead Engineer, Design Lead…"
                    className={cn(FIELD_CLASS, "h-12")}
                  />
                </div>

                <div className="flex flex-1 flex-col">
                  <FieldLabel htmlFor="profile-bio" label="Bio" />
                  <textarea
                    id="profile-bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Describe your focus area…"
                    className={cn(
                      FIELD_CLASS,
                      "min-h-[132px] flex-1 resize-none py-3.5 leading-relaxed"
                    )}
                  />
                </div>

                <div>
                  <FieldLabel label="Authentication Email" locked />
                  <div className="flex h-12 cursor-not-allowed items-center gap-3 rounded-xl bg-surface-sunken px-4 ring-1 ring-inset ring-line/[0.04]">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                    <span className="truncate font-mono text-[12px] text-ink-dim">
                      {user.email}
                    </span>
                  </div>
                </div>
              </div>
            </DashboardCard>

            {/* Role & Capabilities */}
            <DashboardCard interactive={false} className="h-full">
              <CardHeader
                title="Capabilities"
                icon={ShieldCheck}
                meta={
                  <StatusChip
                    label={`${grantedCount} / ${capabilities.length}`}
                    tone="neutral"
                  />
                }
              />

              <div className="flex flex-1 flex-col">
                {/* Role identity */}
                <div className="mb-7 flex items-center gap-4 rounded-2xl bg-surface-card p-5 ring-1 ring-inset ring-line/[0.05]">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-control ring-1 ring-inset ring-line/[0.08]">
                    <RoleIcon className="h-5 w-5 text-ink" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono text-[9px] uppercase leading-none tracking-[0.18em] text-ink-dim">
                      Assigned Role
                    </p>
                    <h2 className="mt-2 text-[20px] font-light capitalize leading-none tracking-tight text-ink">
                      {user.role.toLowerCase()}
                    </h2>
                  </div>
                </div>

                <CardEyebrow className="mb-4 block">Access Matrix</CardEyebrow>

                <ul className="flex flex-1 flex-col gap-2">
                  {capabilities.map((cap) => (
                    <li
                      key={cap.label}
                      className={cn(
                        "flex items-center gap-3.5 rounded-xl px-4 py-3 transition-colors duration-300",
                        cap.granted
                          ? "bg-surface-raised ring-1 ring-inset ring-line/[0.05]"
                          : "ring-1 ring-inset ring-line/[0.03]"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
                          cap.granted
                            ? "bg-orbit-green/[0.12] text-orbit-green"
                            : "bg-surface-card text-ink-faint"
                        )}
                      >
                        {cap.granted ? (
                          <Check className="h-3 w-3" aria-hidden />
                        ) : (
                          <Minus className="h-3 w-3" aria-hidden />
                        )}
                      </span>
                      <span
                        className={cn(
                          "text-[13px] font-light",
                          cap.granted ? "text-ink" : "text-ink-dim"
                        )}
                      >
                        {cap.label}
                      </span>
                      <span className="sr-only">
                        {cap.granted ? "Granted" : "Not granted"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </DashboardCard>
          </div>
        </ScrollReveal>

        {/* ══ Projects ═══════════════════════════════════════════════════ */}
        <ScrollReveal delay={200}>
          <div className="pt-4">
            <div className="mb-6 flex items-center justify-between gap-4 px-1">
              <div className="flex items-center gap-2.5">
                <FolderKanban className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                <CardEyebrow>{isOwner ? "All Projects" : "My Projects"}</CardEyebrow>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
                {String(involvedProjects.length).padStart(2, "0")} Active
              </span>
            </div>

            {involvedProjects.length === 0 ? (
              <DashboardCard interactive={false} tone="quiet" className="items-center py-16">
                <FolderKanban className="mb-5 h-7 w-7 text-ink-faint" aria-hidden />
                <p className="text-[15px] font-medium text-ink">No projects assigned</p>
                <p className="mt-2 max-w-xs text-center text-[13px] font-light leading-relaxed text-ink-muted">
                  Projects appear here once work is assigned to you.
                </p>
              </DashboardCard>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {involvedProjects.map((project) => {
                  const projectTasks = tasks.filter((t) => t.projectId === project.id);
                  const projectActive = projectTasks.filter((t) => t.status !== "done").length;
                  const projectDone = projectTasks.filter((t) => t.status === "done").length;
                  const total = projectTasks.length;
                  const progress = total > 0 ? Math.round((projectDone / total) * 100) : 0;

                  return (
                    <button
                      key={project.id}
                      onClick={() => router.push(`/projects/${project.id}`)}
                      className="rounded-3xl text-left transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
                    >
                      <DashboardCard className="h-full p-6">
                        <div className="mb-6 flex items-start justify-between gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-control ring-1 ring-inset ring-line/[0.06]">
                            <FolderKanban className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
                          </span>
                          <ChevronRight
                            className="h-4 w-4 shrink-0 text-ink-faint transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-ink"
                            aria-hidden
                          />
                        </div>

                        <h3 className="truncate text-[15px] font-medium leading-tight tracking-tight text-ink">
                          {project.name}
                        </h3>
                        <p className="mt-2 font-mono text-[11px] text-ink-dim">
                          {projectActive} active · {projectDone} done
                        </p>

                        <div className="mt-auto pt-6">
                          <div className="mb-2.5 flex items-center justify-between">
                            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-dim">
                              Progress
                            </span>
                            <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                              {progress}%
                            </span>
                          </div>
                          <MeterBar
                            value={progress}
                            color={progress === 100 ? themeColor.green : themeColor.ink}
                          />
                        </div>
                      </DashboardCard>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollReveal>

        {/* ══ Security ═══════════════════════════════════════════════════ */}
        <ScrollReveal delay={240}>
          <div className="pt-4">
            <DashboardCard
              interactive={false}
              tone="quiet"
              className="ring-orbit-red/[0.14]"
            >
              <CardHeader title="Security" icon={Lock} />

              <div className="flex flex-col items-start justify-between gap-7 sm:flex-row sm:items-center">
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orbit-red/[0.1] ring-1 ring-inset ring-orbit-red/20">
                    <LogOut className="h-4 w-4 text-orbit-red" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-medium tracking-tight text-ink">
                      End Session
                    </h3>
                    <p className="mt-2 max-w-sm text-[13px] font-light leading-relaxed text-ink-muted">
                      Securely clear local workspace context and sign out of OrbitOS.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className={cn(
                    "inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-xl px-5 sm:w-auto",
                    "bg-orbit-red/[0.08] text-orbit-red ring-1 ring-inset ring-orbit-red/25",
                    "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-orbit-red/[0.16]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-red/40 focus-visible:ring-offset-2 focus-visible:ring-offset-base",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  {isSigningOut ? (
                    <Loader size={14} stroke={2} color={themeColor.red} />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" aria-hidden />
                  )}
                  <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em]">
                    {isSigningOut ? "Signing Out" : "Sign Out"}
                  </span>
                </button>
              </div>
            </DashboardCard>
          </div>
        </ScrollReveal>
      </div>
    </DashboardShell>
  );
}
