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
import { MailHealthBanner } from "@/components/dashboard/mail-health-banner";
import { OwnerDashboardView } from "@/components/dashboard/owner-view";
import { MemberDashboardView } from "@/components/dashboard/member-view";
import { EmptyDashboardState } from "@/components/dashboard/empty-dashboard-state";
import { AddMemberDialog } from "@/components/members/add-member-dialog";
import { CreateProjectDialog } from "@/components/dashboard/create-project-dialog";
import { ProfileModal } from "@/components/dashboard/profile-modal";
import { Task } from "@/types/task";
import { Member } from "@/types/member";
import { OrbitalDashboardData, OwnerDashboardData, MemberDashboardData } from "@/types/dashboard";
import { RefreshCw, Plus } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ActionButton } from "@/components/dashboard/dashboard-card";
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
  // Safe resolution if data fails to load due to index propagation
  const hasProject = data 
    ? (isOwner 
        ? (data as OwnerDashboardData).projectsHealth?.length > 0
        : (data as MemberDashboardData).myProjects?.length > 0)
    : false;

  return (
    <DashboardShell className="bg-base text-ink min-h-screen selection:bg-surface-hover selection:text-ink-strong">
      {/* Structural Navigation Layer — stays reachable on a long scroll */}
      <header className="sticky top-0 z-40 -mx-5 mb-12 border-b border-line/[0.05] bg-base/80 px-5 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        <div className="flex h-16 items-center justify-between tracking-tight">
          <div className="flex items-center gap-3.5">
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[10px] bg-surface-control shadow-raised">
              <Image src="/logo.png" alt="" fill className="z-10 rounded-[inherit] object-cover" />
            </div>
            <span className="text-[15px] font-medium tracking-tight text-ink">OrbitOS</span>
          </div>

          <div className="flex items-center gap-2">
            <ActionButton
              icon={RefreshCw}
              label="Refresh"
              variant="ghost"
              collapsed
              disabled={refreshing}
              onClick={() => { setRefreshing(true); setRefreshKey(prev => prev + 1); loadOperationalData(); }}
              className={cn(refreshing && "[&_svg]:animate-spin")}
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
        <DashboardHeader
          currentUser={{ ...user, id: user.id } as Member}
          orgName={rawMembers.find(m => m.id === user.id)?.orgId || "Operational Node"}
        />
      </div>

      {/* Renders nothing unless a scheduled mail was actually refused. */}
      <MailHealthBanner />

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
          userId={user.id}
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

      <ProfileModal
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={user as unknown as Member}
      />
    </DashboardShell>
  );
}
