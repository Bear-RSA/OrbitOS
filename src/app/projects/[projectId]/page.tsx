"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Task } from "@/types/task";
import { Member } from "@/types/member";
import { Project } from "@/types/project";
import { getProjectById } from "@/lib/queries/projects";
import { subscribeToTasksByProject } from "@/lib/queries/tasks";
import { subscribeToMembersByOrg } from "@/lib/queries/members";
import { Loader } from "@/components/ui/loader";
import { TasksTable } from "@/components/dashboard/tasks-table";
import { ProjectSettingsMenu } from "@/components/projects/project-settings";
import { ArrowLeft, RefreshCw, Folder, Map, LayoutList, Network } from "lucide-react";
import { SystemExplorer } from "@/components/projects/system-explorer";
import { CommandCenter } from "@/components/projects/command-center";
import { ProjectPulse } from "@/components/projects/project-pulse";
import { SystemRoadmap } from "@/components/dashboard/system-roadmap";
import { PersonnelHub } from "@/components/dashboard/personnel-hub";
import { cn } from "@/lib/utils/classnames";
import { useHeartbeat } from "@/hooks/use-heartbeat";

export default function ProjectDashboardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  // Maintain real-time presence
  useHeartbeat(user?.id);
  
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState<"execution" | "strategy" | "personnel">("execution");
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);
  const { projectId } = use(params);

  const loadProjectMetadata = useCallback(async () => {
    try {
      const proj = await getProjectById(projectId);
      setProject(proj);
    } catch (err) {
      console.error("Failed to load project metadata", err);
    } finally {
      setRefreshing(false);
    }
  }, [projectId, loading]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (!user.orgId) {
      router.push("/onboarding");
      return;
    }

    // 1. Load static metadata
    loadProjectMetadata();

    // 2. Subscribe to Tasks (Real-time Flow)
    if (!projectId) return;

    const unsubTasks = subscribeToTasksByProject(projectId, user.orgId, (data) => {
      setTasks(data);
      if (loading) setLoading(false);
    });

    // 3. Subscribe to Members (Org Network)
    const unsubMembers = subscribeToMembersByOrg(user.orgId, (data) => {
      setMembers(data);
    });

    return () => {
      unsubTasks();
      unsubMembers();
    };
  }, [authLoading, user, router, projectId, loadProjectMetadata, refreshKey]);

  if (authLoading || loading) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center gap-6">
        <Loader />
      </div>
    );
  }

  if (!project) return null;

  return (
    <DashboardShell className="selection:bg-white/10 selection:text-white pb-32">
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
            onClick={() => { setRefreshing(true); setRefreshKey(prev => prev + 1); loadProjectMetadata(); }}
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
         <ProjectSettingsMenu projectId={project.id} projectName={project.name} uid={user!.id} userRole={user!.role} />
      </div>

      <div key={refreshKey}>
        <div className="animate-fade-in" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
           <ProjectPulse projectId={project.id} members={members} />
        </div>

      {/* Project Execution Plane */}
      <div className="animate-fade-in" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
         <div className="flex items-center justify-between mb-8">
            <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#555555] flex items-center gap-3">
               <span className="w-1.5 h-1.5 rounded-full bg-white/[0.04] ring-1 ring-white/[0.08]" />
               Execution Scope
            </h3>
            
            {/* View Toggle */}
            <div className="flex items-center rounded-lg border border-[#1a1a1a] bg-[#000000] p-1">
               <button
                 onClick={() => setViewMode("execution")}
                 className={cn(
                   "flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all",
                   viewMode === "execution" ? "bg-[#111111] text-[#ededed] shadow-sm ring-1 ring-white/5" : "text-[#555] hover:text-[#888]"
                 )}
               >
                 <LayoutList className="w-3.5 h-3.5" />
                 Checklist
               </button>
               <button
                 onClick={() => setViewMode("strategy")}
                 className={cn(
                   "flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all",
                   viewMode === "strategy" ? "bg-[#111111] text-[#ededed] shadow-sm ring-1 ring-white/5" : "text-[#555] hover:text-[#888]"
                 )}
               >
                 <Map className="w-3.5 h-3.5" />
                 Roadmap
               </button>
               <button
                 onClick={() => setViewMode("personnel")}
                 className={cn(
                   "flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all",
                   viewMode === "personnel" ? "bg-[#111111] text-[#ededed] shadow-sm ring-1 ring-white/5" : "text-[#555] hover:text-[#888]"
                 )}
               >
                 <Network className="w-3.5 h-3.5" />
                 Personnel
               </button>
            </div>
         </div>

         {viewMode === "strategy" && (
           <SystemRoadmap projectId={project.id} tasks={tasks} />
         )}

         {viewMode === "personnel" && (
           <div className="mb-12 animate-fade-in">
              <PersonnelHub 
                 projectId={project.id} 
                 orgId={user!.orgId!} 
                 members={members}
                 tasks={tasks}
                 selectedAssignee={selectedAssignee}
                 onAssigneeSelect={setSelectedAssignee}
              />
           </div>
         )}

         <TasksTable
            tasks={tasks}
            selectedAssignee={selectedAssignee}
            onClearFilter={() => setSelectedAssignee(null)}
            members={members}
            currentUserId={user!.id}
            orgId={user!.orgId!}
            projectId={project.id}
             onTaskUpdated={() => {
                console.log("[Telemetry] Objective synchronization triggered - scanning network for state changes");
             }}
         />
      </div>

      {/* System Modules Plane */}
      <div className="mt-24">
        <SystemExplorer projectId={project.id} members={members} isOwner={user!.role === 'OWNER'} uid={user!.id} />
      </div>

      {/* Command Center — Activity Feed Plane */}
      <CommandCenter projectId={project.id} />
      </div>
    </DashboardShell>
  );
}
