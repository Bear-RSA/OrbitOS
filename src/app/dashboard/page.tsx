"use client";

import Image from "next/image";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { getDashboardData } from "@/lib/queries/dashboard";
import {
  computeAttentionMetrics,
  computeProjectRisk,
  computeProjectProgress,
  computeWeeklyProgress,
  computeRecentWins,
  computeTeamWorkload,
} from "@/lib/utils/dashboard";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Loader } from "@/components/ui/loader";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { OwnerAttentionCard } from "@/components/dashboard/owner-attention-card";
import { AtRiskProjectsCard } from "@/components/dashboard/at-risk-projects-card";
import { ProjectProgressCard } from "@/components/dashboard/project-progress-card";
import { WeeklyProgressCard } from "@/components/dashboard/weekly-progress-card";
import { RecentWinsCard } from "@/components/dashboard/recent-wins-card";
import { TeamWorkloadCard } from "@/components/dashboard/team-workload-card";
import { TasksTable } from "@/components/dashboard/tasks-table";
import { AddMemberDialog } from "@/components/members/add-member-dialog";
import { CreateProjectDialog } from "@/components/dashboard/create-project-dialog";
import { ProfileModal } from "@/components/dashboard/profile-modal";
import { Button } from "@/components/ui/button";
import { Task } from "@/types/task";
import { Member } from "@/types/member";
import { Project } from "@/types/project";
import { UserPlus, RefreshCw, FolderPlus, Plus } from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import {
  AttentionMetrics,
  ProjectRisk,
  ProjectProgress,
  WeeklyProgressDay,
  RecentWin,
  TeamWorkloadItem,
} from "@/types/dashboard";

interface DashboardState {
  tasks: Task[];
  project: Project | null;
  members: Member[];
  attention: AttentionMetrics;
  projectRisk: ProjectRisk | null;
  projectProgress: ProjectProgress | null;
  weeklyProgress: WeeklyProgressDay[];
  recentWins: RecentWin[];
  teamWorkload: TeamWorkloadItem[];
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<DashboardState | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.orgId) return;
    try {
      const raw = await getDashboardData(user.orgId);

      const attention = computeAttentionMetrics(raw.tasks);
      const projectRisk = raw.project
        ? computeProjectRisk(raw.tasks, raw.project)
        : null;
      const projectProgress = raw.project
        ? computeProjectProgress(raw.tasks, raw.project)
        : null;
      const weeklyProgress = computeWeeklyProgress(raw.tasks);
      const recentWins = computeRecentWins(raw.tasks, raw.members);
      const teamWorkload = computeTeamWorkload(raw.tasks, raw.members);

      setData({
        tasks: raw.tasks,
        project: raw.project,
        members: raw.members,
        attention,
        projectRisk,
        projectProgress,
        weeklyProgress,
        recentWins,
        teamWorkload,
      });
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setDataLoading(false);
      setRefreshing(false);
    }
  }, [user?.orgId]);

  useEffect(() => {
    if (!authLoading && user?.orgId) {
      loadData();
    }
  }, [authLoading, user?.orgId, loadData]);

  if (authLoading || dataLoading) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center gap-6 animate-in fade-in duration-1000">
        <Loader />
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#555555]">
            System Rendering
          </span>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-[#111111] to-transparent"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  if (!user.orgId) {
    router.push("/onboarding");
    return null;
  }

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const isOwner = user.role === "owner";
  const currentMember: Member = {
    id: user.id,
    email: user.email,
    name: user.name,
    orgId: user.orgId,
    role: user.role,
    createdAt: user.createdAt,
  };

  const hasProject = !!data?.project;

  return (
    <DashboardShell className="bg-[#050505] text-[#ededed] min-h-screen selection:bg-white/10 selection:text-white">
      {/* Top nav - Architectural Void styling, no borders, generous spacing, machined interactions */}
      <div className="flex items-center justify-between mb-24 tracking-tight pt-4">
        <div className="flex items-center gap-5">
          <div className="w-10 h-10 rounded-xl bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.5)] flex items-center justify-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none"></div>
            <Image src="/logo.png" alt="OrbitOS Logo" fill className="object-cover z-10" />
          </div>
          <span className="text-[17px] font-medium text-[#ededed] tracking-tight">OrbitOS</span>
        </div>
        
        <div className="flex items-center gap-5">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            id="refresh-dashboard"
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-full bg-transparent hover:bg-[#111111] text-[#888888] hover:text-[#ededed] transition-all focus:outline-none ring-0",
              refreshing && "animate-spin text-[#666666]"
            )}
            title="Refresh dashboard"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {isOwner && (
            <>
              {!hasProject && (
                <button
                  onClick={() => setCreateProjectOpen(true)}
                  className="gap-2.5 hidden sm:flex items-center justify-center bg-[#ededed] hover:bg-white hover:-translate-y-[2px] text-[#050505] shadow-[0_2px_12px_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.3)] hover:shadow-[0_4px_20px_rgba(255,255,255,0.12),0_12px_32px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-lg px-6 h-10 text-[13px] font-bold tracking-tight focus:outline-none ring-0"
                >
                  <Plus className="w-4 h-4" />
                  New Project
                </button>
              )}
              {hasProject && (
                <button
                  onClick={() => setAddMemberOpen(true)}
                  className="gap-2.5 hidden sm:flex items-center justify-center bg-gradient-to-b from-[#222222] to-[#151515] hover:from-[#2a2a2a] hover:to-[#1a1a1a] hover:-translate-y-[2px] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-lg px-5 h-10 text-[13px] font-medium focus:outline-none ring-0"
                >
                  <UserPlus className="w-4 h-4 text-[#888888]" />
                  Invite Team
                </button>
              )}
            </>
          )}

          {/* User Profile Avatar Hook - Architectural subtle button */}
          <button
            onClick={() => router.push("/profile")}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-[#111111] hover:bg-[#1a1a1a] hover:-translate-y-[2px] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none ring-0 relative overflow-hidden group"
            title="Your Profile"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <span className="text-[13px] font-medium relative z-10">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </button>
        </div>
      </div>

      {/* Header layer - Typography focused */}
      <div className="mb-24">
        <DashboardHeader
          currentUser={currentMember}
          orgName={data?.members?.[0]?.orgId ?? "Your Workspace"}
        />
      </div>

      <div className="flex flex-col gap-12 pb-32">
        {!hasProject ? (
          <div className="flex flex-col gap-8 animate-fade-in">
            {/* Primary Command Anchor */}
            <div className="rounded-[24px] bg-[#0A0A0A] ring-1 ring-white/[0.04] p-12 md:p-20 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
              <div className="absolute top-0 right-0 w-full h-[120%] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/[0.02] via-transparent to-transparent pointer-events-none"></div>
              
              <div className="relative z-10 max-w-2xl">
                <div className="w-12 h-12 rounded-xl bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.4)] flex items-center justify-center mb-10">
                  <FolderPlus className="w-5 h-5 text-[#888888]" />
                </div>
                
                <h2 className="text-[28px] font-light text-[#ededed] tracking-tight mb-4">
                  System Awaiting Signal
                </h2>
                
                <p className="text-[15px] text-[#888888] font-light leading-relaxed mb-12 max-w-lg">
                  OrbitOS is currently inactive. To begin surfacing telemetry on project health, team workload variance, and task clarity, initialize your first workspace module.
                </p>
                
                {isOwner && (
                  <button 
                    onClick={() => setCreateProjectOpen(true)} 
                    className="gap-3 inline-flex items-center justify-center bg-[#ededed] hover:bg-white hover:-translate-y-[2px] text-[#050505] shadow-[0_2px_12px_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.3)] hover:shadow-[0_4px_20px_rgba(255,255,255,0.12),0_12px_32px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-xl px-10 h-12 text-[13px] font-bold tracking-tight focus:outline-none ring-0 group"
                  >
                    <Plus className="w-4 h-4" />
                    Initialize Hub
                  </button>
                )}
                {!isOwner && (
                  <div className="inline-flex items-center gap-3 px-6 h-12 rounded-xl bg-[#111111] border border-white/[0.04]">
                    <div className="w-1.5 h-1.5 rounded-full bg-orbit-yellow/80 shadow-[0_0_8px_rgba(245,176,65,0.4)] animate-pulse" />
                    <span className="text-[13px] text-[#888888] font-medium tracking-wide">Awaiting owner projection</span>
                  </div>
                )}
              </div>
            </div>

            {/* Architectural Intelligence Preview Array */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Ghost Card 1: Telemetry */}
              <div className="rounded-[20px] bg-[#0A0A0A] p-8 ring-1 ring-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] min-h-[220px] flex flex-col relative">
                <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] font-mono text-[#555555] mb-6">
                  Intelligence Layer
                </h3>
                <div className="flex flex-col gap-3 opacity-20">
                  <div className="h-0.5 w-[100%] bg-[#ededed] rounded-full" />
                  <div className="h-0.5 w-[70%] bg-[#ededed] rounded-full" />
                  <div className="h-0.5 w-[40%] bg-[#ededed] rounded-full" />
                </div>
                <div className="mt-auto">
                  <p className="text-[13px] text-[#777777] font-light leading-relaxed">
                    Delivery progress and sprint velocity will automatically map here.
                  </p>
                </div>
              </div>

              {/* Ghost Card 2: Risk */}
              <div className="rounded-[20px] bg-[#0A0A0A] p-8 ring-1 ring-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] min-h-[220px] flex flex-col relative">
                <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] font-mono text-[#555555] mb-6">
                  Risk Identification
                </h3>
                <div className="flex flex-col gap-3 opacity-20">
                  <div className="h-0.5 w-[100%] bg-[#ededed] rounded-full" />
                  <div className="h-0.5 w-[50%] bg-[#ededed] rounded-full" />
                  <div className="h-0.5 w-[80%] bg-[#ededed] rounded-full" />
                </div>
                <div className="mt-auto">
                  <p className="text-[13px] text-[#777777] font-light leading-relaxed">
                    Idle tasks and schedule deviations are surfaced for immediate review.
                  </p>
                </div>
              </div>

              {/* Ghost Card 3: Team */}
              <div className="rounded-[20px] bg-[#0A0A0A] p-8 ring-1 ring-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] min-h-[220px] flex flex-col relative sm:col-span-2 md:col-span-1">
                <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] font-mono text-[#555555] mb-6">
                  Capacity Network
                </h3>
                <div className="flex flex-col gap-3 opacity-20">
                  <div className="h-0.5 w-[100%] bg-[#ededed] rounded-full" />
                  <div className="h-0.5 w-[85%] bg-[#ededed] rounded-full" />
                  <div className="h-0.5 w-[30%] bg-[#ededed] rounded-full" />
                </div>
                <div className="mt-auto">
                  <p className="text-[13px] text-[#777777] font-light leading-relaxed">
                    Team bandwidth is calculated to prevent bottlenecks across active modules.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-20">
            {/* Owner-only: Active Risk Layer */}
            {isOwner && data && (
              <ScrollReveal>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <OwnerAttentionCard metrics={data.attention} hasProject={hasProject} />
                  <AtRiskProjectsCard projectRisk={data.projectRisk} hasProject={hasProject} />
                </div>
              </ScrollReveal>
            )}

            {/* Shared: Active Progress Layer */}
            {data && (
              <>
                <ScrollReveal delay={100}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <ProjectProgressCard progress={data.projectProgress} hasProject={hasProject} />
                    <WeeklyProgressCard weeklyProgress={data.weeklyProgress} />
                    <RecentWinsCard wins={data.recentWins} />
                  </div>
                </ScrollReveal>

                {/* Team Workload */}
                <ScrollReveal delay={150}>
                  <div className="pt-4">
                    <TeamWorkloadCard workload={data.teamWorkload} />
                  </div>
                </ScrollReveal>

                {/* Tasks Table */}
                <ScrollReveal delay={200}>
                  <div className="pt-4">
                    <TasksTable
                      tasks={data.tasks}
                      members={data.members}
                      currentUserId={user.id}
                      isOwner={isOwner}
                      orgId={user.orgId}
                      projectId={data.project?.id ?? ""}
                      onTaskUpdated={handleRefresh}
                    />
                  </div>
                </ScrollReveal>
              </>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {isOwner && (
        <>
          <AddMemberDialog
            open={addMemberOpen}
            onOpenChange={setAddMemberOpen}
            orgId={user.orgId}
            invitedBy={user.id}
          />
          <CreateProjectDialog
            open={createProjectOpen}
            onOpenChange={setCreateProjectOpen}
            orgId={user.orgId}
            ownerId={user.id}
            onSuccess={handleRefresh}
          />
        </>
      )}

      <ProfileModal
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={currentMember}
      />
    </DashboardShell>
  );
}
