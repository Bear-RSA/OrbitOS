"use client";

import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { getDashboardData } from "@/lib/services/dashboard-service";
import { getTasksByOrg } from "@/lib/queries/tasks";
import { getMembersByOrg } from "@/lib/queries/members";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Loader } from "@/components/ui/loader";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { OwnerDashboardView } from "@/components/dashboard/owner-view";
import { MemberDashboardView } from "@/components/dashboard/member-view";
import { EmptyDashboardState } from "@/components/dashboard/empty-dashboard-state";
import { AddMemberDialog } from "@/components/members/add-member-dialog";
import { CreateProjectDialog } from "@/components/dashboard/create-project-dialog";
import { ProfileModal } from "@/components/dashboard/profile-modal";
import { Task } from "@/types/task";
import { Member } from "@/types/member";
import { OrbitalDashboardData, OwnerDashboardData, MemberDashboardData } from "@/types/dashboard";
import { RefreshCw, Plus, UserPlus } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils/classnames";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  const [data, setData] = useState<OrbitalDashboardData | null>(null);
  const [rawTasks, setRawTasks] = useState<Task[]>([]);
  const [rawMembers, setRawMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const loadOperationalData = useCallback(async () => {
    if (!user?.id || !user?.orgId) return;
    
    try {
      const [dashboardData, tasks, members] = await Promise.all([
        getDashboardData(user.id),
        getTasksByOrg(user.orgId),
        getMembersByOrg(user.orgId)
      ]);

      setData(dashboardData);
      setRawTasks(tasks);
      setRawMembers(members);
    } catch (err) {
      console.error("Operational breach: Failed to fetch dashboard metrics", err);
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

  if (!user || !user.orgId) return null;

  const isOwner = user.role === "OWNER";
  // Safe resolution if data fails to load due to index propagation
  const hasProject = data 
    ? (isOwner 
        ? (data as OwnerDashboardData).projectsHealth?.length > 0
        : (data as MemberDashboardData).myProjects?.length > 0)
    : false;

  return (
    <DashboardShell className="bg-[#050505] text-[#ededed] min-h-screen selection:bg-white/10 selection:text-white">
      {/* Structural Navigation Layer */}
      <div className="flex items-center justify-between mb-24 tracking-tight pt-4">
        <div className="flex items-center gap-5">
          <div className="w-10 h-10 rounded-xl bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.5)] flex items-center justify-center relative overflow-hidden group">
            <Image src="/logo.png" alt="OrbitOS Logo" fill className="object-cover rounded-[inherit] z-10" />
          </div>
          <span className="text-[17px] font-medium text-[#ededed] tracking-tight">OrbitOS</span>
        </div>
        
        <div className="flex items-center gap-5">
          <div className={cn("flex items-center justify-end gap-3", isOwner ? "w-[212px]" : "")}>
            <button
              onClick={() => { setRefreshing(true); setRefreshKey(prev => prev + 1); loadOperationalData(); }}
              disabled={refreshing}
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-full bg-transparent hover:bg-[#111111] text-[#888888] hover:text-[#ededed] transition-all focus:outline-none ring-0 shrink-0",
                refreshing && "animate-spin text-[#666666]"
              )}
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {isOwner && (
              <button
                onClick={() => setCreateProjectOpen(true)}
                className="group flex items-center bg-gradient-to-b from-[#222222] to-[#151515] hover:from-[#2a2a2a] hover:to-[#1a1a1a] hover:-translate-y-[1px] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-md h-9 w-9 hover:w-[160px] overflow-hidden focus:outline-none ring-0 shrink-0"
              >
                <div className="flex items-center justify-center w-9 h-9 shrink-0">
                  <Plus className="w-3.5 h-3.5 text-[#888888] transition-colors group-hover:text-[#ededed]" />
                </div>
                <span className="opacity-0 -translate-x-3 whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100 group-hover:translate-x-0 text-[10px] font-mono uppercase tracking-[0.2em] pr-4">
                  Create Project
                </span>
              </button>
            )}
          </div>

          <button
            onClick={() => router.push("/profile")}
            className="focus:outline-none hover:-translate-y-[2px] transition-transform duration-300"
          >
            <UserAvatar 
              photoURL={user.photoURL} 
              name={user.name} 
              size="md" 
            />
          </button>
        </div>
      </div>

      {/* Narrative Header Layer */}
      <div className="mb-24">
        <DashboardHeader
          currentUser={{ ...user, id: user.id } as Member}
          orgName={rawMembers.find(m => m.id === user.id)?.orgId || "Operational Node"}
        />
      </div>

      {/* Content Rendering Layer */}
      <div key={refreshKey} className="flex-1">
        {!data || !hasProject ? (
        <EmptyDashboardState 
          type="no_projects" 
          isOwner={isOwner} 
          onCreateProject={() => setCreateProjectOpen(true)} 
        />
      ) : data.role === 'OWNER' ? (
        <OwnerDashboardView 
          data={data as OwnerDashboardData} 
          members={rawMembers} 
          tasks={rawTasks} 
          orgId={user.orgId} 
          onRefresh={loadOperationalData} 
          onInviteClick={() => setAddMemberOpen(true)}
        />
      ) : (
        <MemberDashboardView 
          data={data as MemberDashboardData} 
          members={rawMembers} 
          tasks={rawTasks} 
          orgId={user.orgId} 
          userId={user.id} 
          onRefresh={loadOperationalData} 
        />
      )}
      </div>

      {/* Telemetry Modals */}
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
            onSuccess={loadOperationalData}
          />
        </>
      )}

      <ProfileModal
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={user as unknown as Member}
      />
    </DashboardShell>
  );
}
