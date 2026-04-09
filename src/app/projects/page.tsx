"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { getProjectsByOrg } from "@/lib/queries/projects";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Loader } from "@/components/ui/loader";
import { WorkspaceProjects } from "@/components/dashboard/workspace-projects";
import { Project } from "@/types/project";
import { ArrowLeft } from "lucide-react";

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
      <div className="min-h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center gap-6">
        <Loader />
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#555555]">
            Resolving Network
          </span>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-[#111111] to-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell className="bg-[#050505] text-[#ededed] min-h-screen selection:bg-white/10 selection:text-white">
      <div className="flex items-center gap-4 mb-20 group">
        <button 
          onClick={() => router.push("/dashboard")}
          className="p-2 -ml-2 text-[#555555] hover:text-[#ededed] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-sm font-mono tracking-[0.2em] text-[#555555] uppercase">Workspace</h1>
          <div className="text-xl font-medium tracking-tight mt-1">Operational Projects</div>
        </div>
      </div>

      <WorkspaceProjects projects={projects} />
    </DashboardShell>
  );
}
