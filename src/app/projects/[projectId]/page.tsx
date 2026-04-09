"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Task } from "@/types/task";
import { Member } from "@/types/member";
import { Project } from "@/types/project";
import { getProjectById } from "@/lib/queries/projects";
import { getTasksByOrg } from "@/lib/queries/tasks";
import { getMembersByOrg } from "@/lib/queries/members";
import { Loader } from "@/components/ui/loader";
import { TasksTable } from "@/components/dashboard/tasks-table";
import { ProjectSettingsMenu } from "@/components/projects/project-settings";
import { ArrowLeft, RefreshCw, Folder } from "lucide-react";
import { cn } from "@/lib/utils/classnames";

export default function ProjectDashboardPage({ params }: { params: { projectId: string } }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const projectId = params.projectId;

  const loadProjectData = useCallback(async () => {
    if (!user?.orgId) return;
    
    try {
      const [proj, allTasks, allMembers] = await Promise.all([
        getProjectById(projectId),
        getTasksByOrg(user.orgId),
        getMembersByOrg(user.orgId)
      ]);

      setProject(proj);
      const projectTasks = allTasks.filter(t => t.projectId === projectId);
      setTasks(projectTasks);
      setMembers(allMembers);
    } catch (err) {
      console.error("Failed to load project context", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.orgId, projectId]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else if (!user.orgId) {
        router.push("/onboarding");
      } else {
        loadProjectData();
      }
    }
  }, [authLoading, user, router, loadProjectData]);

  if (authLoading || loading) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center gap-6">
        <Loader />
      </div>
    );
  }

  if (!project) return null;

  return (
    <DashboardShell className="bg-[#050505] text-[#ededed] min-h-screen selection:bg-white/10 selection:text-white pb-32">
      {/* Navigation Map */}
      <div className="flex items-center justify-between mb-16 tracking-tight pt-4">
        <button 
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-3 text-[#666666] hover:text-[#ededed] transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-[13px] font-medium tracking-tight uppercase">Workspace</span>
        </button>
        
        <div className="flex items-center gap-5">
          <button
            onClick={() => { setRefreshing(true); loadProjectData(); }}
            disabled={refreshing}
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-full bg-transparent hover:bg-[#111111] text-[#888888] hover:text-[#ededed] transition-all focus:outline-none ring-0",
              refreshing && "animate-spin text-[#666666]"
            )}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Project Header Layer */}
      <div className="mb-20 animate-fade-in flex items-start justify-between">
         <div className="space-y-4">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-[#0A0A0A] rounded-2xl flex items-center justify-center ring-1 ring-white/5">
                 <Folder className="w-5 h-5 text-[#888888]" />
               </div>
               <div className="flex flex-col">
                 <span className="text-[10px] font-mono text-[#555555] uppercase tracking-widest mb-1.5">Project Thread</span>
                 <h1 className="text-3xl font-light text-[#ededed] tracking-tight">{project.name}</h1>
               </div>
            </div>
         </div>
         {/* Settings Control Container */}
         <ProjectSettingsMenu projectId={project.id} projectName={project.name} uid={user!.id} />
      </div>

      {/* Project Execution Plane */}
      <div className="animate-fade-in" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
         <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#555555] mb-8 flex items-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-white/[0.04] ring-1 ring-white/[0.08]" />
            Execution Scope
         </h3>
         <TasksTable
            tasks={tasks}
            members={members}
            currentUserId={user!.id}
            isOwner={user!.role === 'owner'}
            orgId={user!.orgId!}
            projectId={project.id}
            onTaskUpdated={loadProjectData}
         />
      </div>
    </DashboardShell>
  );
}
