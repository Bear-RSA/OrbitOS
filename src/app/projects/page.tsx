"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { getProjectsByOrg } from "@/lib/queries/projects";
import { getTasksByOrg } from "@/lib/queries/tasks";
import { calculateProjectHealth } from "@/lib/utils/dashboard-logic";
import { ProjectHealth } from "@/types/dashboard";
import { AppHeader } from "@/components/nav/app-header";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OrbitLoader } from "@/components/brand/orbit-loader";
import { WorkspaceProjects } from "@/components/dashboard/workspace-projects";
import { GlassSurface } from "@/components/ui/glass-surface";
import Link from "next/link";

export default function ProjectsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [projectsHealth, setProjectsHealth] = useState<ProjectHealth[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    if (!user?.orgId) return;
    try {
      // Graded from real tasks, the same way the dashboard grades them.
      // These cards used to print "Healthy 100%" for every project.
      const [projects, tasks] = await Promise.all([
        getProjectsByOrg(user.orgId),
        getTasksByOrg(user.orgId),
      ]);
      setProjectsHealth(
        projects.map(p => calculateProjectHealth(p, tasks.filter(t => t.projectId === p.id)))
      );
    } catch (err) {
      console.error("Operational breach: Failed to fetch projects", err);
    } finally {
      setLoading(false);
    }
  }, [user?.orgId]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else {
        loadProjects();
      }
    }
  }, [authLoading, user, router, loadProjects]);

  if (authLoading || loading) {
    return (
      <div className="min-h-[100dvh] w-full bg-ground flex flex-col items-center justify-center gap-6">
        <OrbitLoader />
        <div className="flex flex-col items-center gap-2">
          <span className="text-[12px] text-ink-dim">
            Loading projects…
          </span>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-surface-control to-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell className="bg-ground text-ink min-h-screen selection:bg-surface-hover selection:text-ink-strong">
      <AppHeader user={user ?? {}} />

      <div className="mb-20">
        <p className="text-sm text-ink-dim">Workspace</p>
        <h1 className="text-xl font-medium tracking-tight mt-1">Projects</h1>
      </div>

      <WorkspaceProjects
        projectsHealth={projectsHealth}
        orgId={user?.orgId}
        userId={user?.id}
        isOwner={user?.role === "OWNER"}
        onRefresh={loadProjects}
        emptyState={
          <GlassSurface
            fallback="material-fog [--fog-base:var(--surface-sunken)]"
            tint="surface-sunken"
            className="mb-32 rounded-3xl border border-line/[0.06] p-8 shadow-raised ring-1 ring-line/5"
            contentClassName="space-y-2"
          >
            <p className="text-[15px] font-medium text-ink">Your projects will be in here</p>
            <p className="max-w-prose text-[13px] font-light leading-relaxed text-ink-muted">
              {user?.role === "OWNER" ? (
                <>
                  Start your first one from the{" "}
                  <Link
                    href="/dashboard"
                    className="rounded-sm text-ink underline underline-offset-4 hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    dashboard
                  </Link>
                  . Each project gets its own tasks, files, calendar and briefings.
                </>
              ) : (
                "Projects show up here once an owner creates one and adds you to it."
              )}
            </p>
          </GlassSurface>
        }
      />
    </DashboardShell>
  );
}
