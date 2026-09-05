"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { getDashboardData } from "@/lib/services/dashboard-service";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Loader } from "@/components/ui/loader";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { MailHealthBanner } from "@/components/dashboard/mail-health-banner";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { EmptyDashboardState } from "@/components/dashboard/empty-dashboard-state";
import { CreateProjectDialog } from "@/components/dashboard/create-project-dialog";
import { AppHeader } from "@/components/nav/app-header";
import { Task } from "@/types/task";
import { Member } from "@/types/member";
import { DashboardData } from "@/types/dashboard";
import { resolvePreferences } from "@/types/preferences";
import { RefreshCw, Plus, AlertTriangle } from "lucide-react";
import { ActionButton } from "@/components/dashboard/dashboard-card";
import { cn } from "@/lib/utils/classnames";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<DashboardData | null>(null);
  const [rawTasks, setRawTasks] = useState<Task[]>([]);
  const [rawMembers, setRawMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Distinct from "no data". A failed read used to fall through to the
  // no-projects empty state, so a network blip was indistinguishable from
  // an empty workspace.
  const [loadError, setLoadError] = useState(false);

  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  const loadOperationalData = useCallback(async () => {
    if (!user?.id || !user?.orgId) return;

    try {
      // The service already reads tasks, projects and members to assemble
      // the view model, and now hands them back. The page used to re-query
      // tasks and members alongside it — two extra org-wide collection
      // reads on every load and every refresh.
      const payload = await getDashboardData(user.id);

      if (!payload) {
        setLoadError(true);
        return;
      }

      setData(payload.data);
      setRawTasks(payload.tasks);
      setRawMembers(payload.members);
      setLoadError(false);
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
  const hasProject = (data?.projectsHealth?.length ?? 0) > 0;

  return (
    <DashboardShell className="bg-base text-ink min-h-screen selection:bg-surface-hover selection:text-ink-strong">
      {/* Structural Navigation Layer — stays reachable on a long scroll */}
      <AppHeader
        user={user}
        actions={
          <>
            <ActionButton
              icon={RefreshCw}
              label="Refresh"
              variant="ghost"
              collapsed
              disabled={refreshing}
              onClick={refresh}
              className={cn(refreshing && "[&_svg]:animate-spin")}
            />

            <ActionButton
              icon={Plus}
              label="Create Project"
              collapsed
              onClick={() => setCreateProjectOpen(true)}
            />
          </>
        }
      />

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
          /* Empty now means the workspace has no projects, for everyone —
             it is no longer possible for one seat to see an empty
             dashboard while another sees a full one. */
          <EmptyDashboardState
            type="no_projects"
            isOwner={isOwner}
            onCreateProject={() => setCreateProjectOpen(true)}
          />
        ) : (
          <DashboardView
            data={data}
            members={rawMembers}
            tasks={rawTasks}
            orgId={user.orgId}
            userId={user.id}
            clock24h={clock24h}
            refreshKey={refreshKey}
            onRefresh={loadOperationalData}
          />
        )}
      </div>

      {/* Telemetry Modals — seat management lives on /teams */}
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        orgId={user.orgId}
        createdBy={user.id}
        onSuccess={loadOperationalData}
      />
    </DashboardShell>
  );
}
