"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { getProjectsByOrg } from "@/lib/queries/projects";
import { AppNav } from "@/components/nav/app-nav";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Loader } from "@/components/ui/loader";
import { WorkspaceProjects } from "@/components/dashboard/workspace-projects";
import { Project } from "@/types/project";

export default function ProjectsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    if (!user?.orgId) return;
    try {
      const data = await getProjectsByOrg(user.orgId);
      setProjects(data);
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
      <div className="min-h-[100dvh] w-full bg-base flex flex-col items-center justify-center gap-6">
        <Loader />
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-ink-dim">
            Resolving Network
          </span>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-surface-control to-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell className="bg-base text-ink min-h-screen selection:bg-surface-hover selection:text-ink-strong">
      <header className="sticky top-0 z-40 -mx-5 mb-12 border-b border-line/[0.05] bg-base/80 px-5 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        <div className="flex h-16 items-center tracking-tight">
          <AppNav uid={user?.id} orgId={user?.orgId} />
        </div>
      </header>

      <div className="mb-20">
        <h1 className="text-sm font-mono tracking-[0.2em] text-ink-dim uppercase">Workspace</h1>
        <div className="text-xl font-medium tracking-tight mt-1">Operational Projects</div>
      </div>

      <WorkspaceProjects
        projects={projects}
        orgId={user?.orgId}
        userId={user?.id}
        isOwner={user?.role === "OWNER"}
        onRefresh={loadProjects}
      />
    </DashboardShell>
  );
}
