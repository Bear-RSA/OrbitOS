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
import { subscribeToEventsByProject } from "@/lib/queries/events";
import { OrbitEvent } from "@/types/event";
import { Loader } from "@/components/ui/loader";
import { TasksTable } from "@/components/dashboard/tasks-table";
import { ProjectSettingsMenu } from "@/components/projects/project-settings";
import { ArrowLeft, RefreshCw, Folder, Archive } from "lucide-react";
import { SystemExplorer } from "@/components/projects/system-explorer";
import { ProjectCalendar } from "@/components/projects/project-calendar";
import { CommandCenter } from "@/components/projects/command-center";
import { ProjectPulse } from "@/components/projects/project-pulse";
import { ExecutionViewTabs, type ExecutionView } from "@/components/projects/execution-view-tabs";
import { SystemRoadmap } from "@/components/dashboard/system-roadmap";
import { PersonnelHub } from "@/components/dashboard/personnel-hub";
import { cn } from "@/lib/utils/classnames";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { ActionButton, CardEyebrow } from "@/components/dashboard/dashboard-card";

export default function ProjectDashboardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  // Maintain real-time presence
  useHeartbeat(user?.id);
  
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<OrbitEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState<ExecutionView>("execution");
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

    // 4. Subscribe to Engagements (Temporal Lane)
    const unsubEvents = subscribeToEventsByProject(projectId, user.orgId, (data) => {
      setEvents(data);
    });

    return () => {
      unsubTasks();
      unsubMembers();
      unsubEvents();
    };
  }, [authLoading, user, router, projectId, loadProjectMetadata, refreshKey]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-background">
        <Loader />
      </div>
    );
  }

  if (!project) return null;

  return (
    <DashboardShell className="selection:bg-surface-hover selection:text-ink-strong pb-32">
      {/* Navigation Map */}
      <div className="flex items-center justify-between mb-12 tracking-tight pt-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="group flex items-center gap-3 rounded-lg text-ink-dim transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em]">Workspace</span>
        </button>

        <ActionButton
          icon={RefreshCw}
          label="Refresh"
          variant="ghost"
          collapsed
          disabled={refreshing}
          onClick={() => { setRefreshing(true); setRefreshKey(prev => prev + 1); loadProjectMetadata(); }}
          className={cn(refreshing && "[&_svg]:animate-spin")}
        />
      </div>

      {/* Project Header Layer */}
      <div className="mb-12 animate-fade-in flex items-start justify-between gap-6">
         <div className="min-w-0">
            <div className="flex items-center gap-4">
               <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-card ring-1 ring-inset ring-line/[0.06] shadow-card">
                 <Folder className="w-5 h-5 text-ink-muted" />
               </div>
               <div className="flex min-w-0 flex-col gap-1.5">
                 <CardEyebrow>Project Thread</CardEyebrow>
                 <div className="flex min-w-0 items-center gap-3">
                   <h1 className="truncate text-3xl font-light tracking-tight text-ink">{project.name}</h1>
                   {project.archived && (
                     <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-orbit-amber/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-orbit-amber ring-1 ring-inset ring-orbit-amber/20">
                       <Archive className="h-3 w-3" aria-hidden />
                       Archived
                     </span>
                   )}
                 </div>
               </div>
            </div>
            {project.description && (
              <p className="mt-5 max-w-xl text-[14px] font-light leading-relaxed text-ink-muted">
                {project.description}
              </p>
            )}
         </div>
         {/* Settings Control Container */}
         <ProjectSettingsMenu
           projectId={project.id}
           projectName={project.name}
           projectDescription={project.description}
           uid={user!.id}
           userRole={user!.role}
           isArchived={project.archived === true}
           onArchiveChange={loadProjectMetadata}
         />
      </div>

      <div key={refreshKey}>
        <div className="animate-fade-in" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
           <ProjectPulse projectId={project.id} members={members} />
        </div>

      {/* Project Execution Plane */}
      <div className="animate-fade-in" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
         <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
               <span className="h-1.5 w-1.5 rounded-full bg-surface-active ring-1 ring-line/[0.08]" />
               <CardEyebrow>Execution Scope</CardEyebrow>
            </div>

            {/* View Toggle */}
            <ExecutionViewTabs value={viewMode} onChange={setViewMode} />
         </div>

         {viewMode === "calendar" && (
           <ProjectCalendar
             tasks={tasks}
             events={events}
             members={members}
             uid={user!.id}
             projectId={project.id}
           />
         )}

         {viewMode === "strategy" && (
           <SystemRoadmap tasks={tasks} members={members} />
         )}

         {viewMode === "personnel" && (
           <div className="mb-12 animate-fade-in">
              <PersonnelHub 
                 projectId={project.id} 
                 orgId={user!.orgId!} 
                 members={members}
                 tasks={tasks}
                 events={events}
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
      <div className="mt-20">
        <SystemExplorer projectId={project.id} members={members} isOwner={user!.role === 'OWNER'} uid={user!.id} />
      </div>

      {/* Command Center — Activity Feed Plane */}
      <CommandCenter projectId={project.id} />
      </div>
    </DashboardShell>
  );
}
