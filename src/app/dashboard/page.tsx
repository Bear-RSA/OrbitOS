"use client";

import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { getDashboardData } from "@/lib/services/dashboard-service";
import { getOrgActivityAction } from "@/app/actions/activity";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Loader } from "@/components/ui/loader";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { MailHealthBanner } from "@/components/dashboard/mail-health-banner";
import { OwnerDashboardView } from "@/components/dashboard/owner-view";
import { MemberDashboardView } from "@/components/dashboard/member-view";
import { EmptyDashboardState } from "@/components/dashboard/empty-dashboard-state";
import { AddMemberDialog } from "@/components/members/add-member-dialog";
import { CreateProjectDialog } from "@/components/dashboard/create-project-dialog";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { AppNav } from "@/components/nav/app-nav";
import { Task } from "@/types/task";
import { Member } from "@/types/member";
import { Project } from "@/types/project";
import {
  DashboardActivityItem,
  OrbitalDashboardData,
  OwnerDashboardData,
  MemberDashboardData,
} from "@/types/dashboard";
import { resolvePreferences } from "@/types/preferences";
import { RefreshCw, Plus, ListPlus, AlertTriangle } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ActionButton } from "@/components/dashboard/dashboard-card";
import { MessagesMenu } from "@/components/messages/messages-menu";
import { cn } from "@/lib/utils/classnames";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<OrbitalDashboardData | null>(null);
  const [rawTasks, setRawTasks] = useState<Task[]>([]);
  const [rawMembers, setRawMembers] = useState<Member[]>([]);
  const [rawProjects, setRawProjects] = useState<Project[]>([]);
  const [activity, setActivity] = useState<DashboardActivityItem[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Distinct from "no data". A failed read used to fall through to the
  // no-projects empty state, so a network blip was indistinguishable from
  // an empty workspace.
  const [loadError, setLoadError] = useState(false);

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);

  const loadOperationalData = useCallback(async () => {
    if (!user?.id || !user?.orgId) return;

    try {
      // The service already reads tasks, projects and members to assemble
      // the view model, and now hands them back. The page used to re-query
      // tasks and members alongside it — two extra org-wide collection
      // reads on every load and every refresh.
      const [payload, activityResult] = await Promise.all([
        getDashboardData(user.id),
        getOrgActivityAction(),
      ]);

      if (!payload) {
        setLoadError(true);
        return;
      }

      setData(payload.data);
      setRawTasks(payload.tasks);
      setRawMembers(payload.members);
      setRawProjects(payload.projects);
      setLoadError(false);

      // The log is supplementary — its failure must not blank the page.
      setActivity(activityResult.items);
      setActivityError(activityResult.success ? null : activityResult.error ?? "Unavailable.");
    } catch (err) {
      console.error("Operational breach: Failed to fetch dashboard metrics", err);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, user?.orgId]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        // Give a tiny buffer for Firestore sync if Auth is present but profile is null
        const timer = setTimeout(() => {
          if (!user) router.push("/login");
        }, 1500);
        return () => clearTimeout(timer);
      } else if (!user.orgId) {
        // No org — route based on role
        if (user.role === "OWNER") {
          router.push("/onboarding");
        } else {
          // If role is missing (syncing), wait a bit more
          const timer = setTimeout(() => {
            if (!user.orgId) router.push("/login");
          }, 1500);
          return () => clearTimeout(timer);
        }
      } else if (user.role === "MEMBER" && !user.name) {
        router.push("/onboarding/member");
      } else {
        loadOperationalData();
      }
    }
  }, [authLoading, user, router, loadOperationalData]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((prev) => prev + 1);
    loadOperationalData();
  }, [loadOperationalData]);

  if (authLoading || loading) {
    return (
      <div className="min-h-[100dvh] w-full bg-base flex flex-col items-center justify-center gap-6">
        <Loader />
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">
            Resolving Network
          </span>
          <div className="h-px w-24 bg-gradient-to-r from-transparent via-line/15 to-transparent"></div>
        </div>
      </div>
    );
  }

  if (!user || !user.orgId) return null;

  const isOwner = user.role === "OWNER";
  const clock24h = resolvePreferences(user.preferences).clock24h;

  // Safe resolution if data fails to load due to index propagation
  const hasProject = data
    ? (isOwner
        ? (data as OwnerDashboardData).projectsHealth?.length > 0
        : (data as MemberDashboardData).myProjects?.length > 0)
    : false;

  // Quick capture needs somewhere to put the task. Members can only file
  // against projects they already hold work in.
  const capturableProjects = isOwner
    ? rawProjects
    : ((data as MemberDashboardData | null)?.myProjects ?? []);

  return (
    <DashboardShell className="bg-base text-ink min-h-screen selection:bg-surface-hover selection:text-ink-strong">
      {/* Structural Navigation Layer — stays reachable on a long scroll */}
      <header className="sticky top-0 z-40 -mx-5 mb-12 border-b border-line/[0.05] bg-base/80 px-5 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        <div className="flex h-16 items-center justify-between gap-4 tracking-tight">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[10px] bg-surface-control shadow-raised">
              <Image src="/logo.png" alt="" fill className="z-10 rounded-[inherit] object-cover" />
            </div>
            {/* The wordmark yields to the nav on small screens. */}
            <span className="hidden text-[15px] font-medium tracking-tight text-ink md:inline">OrbitOS</span>
            <AppNav uid={user.id} orgId={user.orgId} className="ml-1" />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ActionButton
              icon={RefreshCw}
              label="Refresh"
              variant="ghost"
              collapsed
              disabled={refreshing}
              onClick={refresh}
              className={cn(refreshing && "[&_svg]:animate-spin")}
            />

            <MessagesMenu
              uid={user.id}
              orgId={user.orgId}
              members={rawMembers}
              onOpen={(conversationId) =>
                router.push(
                  conversationId ? `/messages?c=${conversationId}` : "/messages"
                )
              }
            />

            {/* Quick capture — a task could previously only be created from
                inside a project page. */}
            <ActionButton
              icon={ListPlus}
              label="New Task"
              variant="ghost"
              collapsed
              disabled={capturableProjects.length === 0}
              onClick={() => setCreateTaskOpen(true)}
            />

            <ActionButton
              icon={Plus}
              label="Create Project"
              collapsed
              onClick={() => setCreateProjectOpen(true)}
            />

            <button
              onClick={() => router.push("/profile")}
              aria-label="Open your profile"
              title="Profile"
              className="ml-1 rounded-full transition-transform duration-300 hover:-translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
            >
              <UserAvatar
                photoURL={user.photoURL}
                name={user.name}
                size="md"
              />
            </button>
          </div>
        </div>
      </header>

      {/* Narrative Header Layer */}
      <div className="mb-12 sm:mb-16">
        <DashboardHeader currentUser={{ ...user, id: user.id } as Member} />
      </div>

      {/* Renders nothing unless a scheduled mail was actually refused. */}
      <MailHealthBanner />

      {/* Content Rendering Layer */}
      <div key={refreshKey} className="flex-1">
        {loadError ? (
          <div className="flex flex-col items-start gap-5 rounded-3xl bg-surface-sunken p-8 shadow-card ring-1 ring-inset ring-line/[0.06]">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-4 w-4 text-orbit-amber" aria-hidden />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                Telemetry unreachable
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-[15px] font-medium text-ink">Could not load your workspace.</p>
              <p className="max-w-prose text-[13px] font-light leading-relaxed text-ink-muted">
                This is a read failure, not an empty workspace — nothing has been lost. Try again in a moment.
              </p>
            </div>
            <ActionButton icon={RefreshCw} label="Retry" onClick={refresh} disabled={refreshing} />
          </div>
        ) : !data || !hasProject ? (
          <EmptyDashboardState
            type={!isOwner && rawProjects.length > 0 ? "no_assigned_work" : "no_projects"}
            isOwner={isOwner}
            onCreateProject={() => setCreateProjectOpen(true)}
          />
        ) : data.role === 'OWNER' ? (
          <OwnerDashboardView
            data={data as OwnerDashboardData}
            members={rawMembers}
            tasks={rawTasks}
            orgId={user.orgId}
            userId={user.id}
            activity={activity}
            activityError={activityError}
            clock24h={clock24h}
            refreshKey={refreshKey}
            onRefresh={loadOperationalData}
            onInviteClick={() => setAddMemberOpen(true)}
          />
        ) : (
          <MemberDashboardView
            data={data as MemberDashboardData}
            members={rawMembers}
            orgId={user.orgId}
            userId={user.id}
            activity={activity}
            activityError={activityError}
            clock24h={clock24h}
            refreshKey={refreshKey}
            onRefresh={loadOperationalData}
          />
        )}
      </div>

      {/* Telemetry Modals */}
      {isOwner && (
        <AddMemberDialog
          open={addMemberOpen}
          onOpenChange={setAddMemberOpen}
          orgId={user.orgId}
          invitedBy={user.id}
        />
      )}
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        orgId={user.orgId}
        createdBy={user.id}
        onSuccess={loadOperationalData}
      />

      <CreateTaskDialog
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        orgId={user.orgId}
        projects={capturableProjects.map((p) => ({ id: p.id, name: p.name }))}
        members={rawMembers}
        currentUserId={user.id}
        onCreated={loadOperationalData}
      />
    </DashboardShell>
  );
}
