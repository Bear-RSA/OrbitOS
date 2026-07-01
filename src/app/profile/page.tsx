"use client";

import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Loader } from "@/components/ui/loader";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { getTasksByOrg } from "@/lib/queries/tasks";
import { getProjectsByOrg } from "@/lib/queries/projects";
import { db } from "@/lib/firebase/client";
import { doc, updateDoc } from "firebase/firestore";
import { signOut as firebaseSignOut } from "@/lib/firebase/auth";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Task } from "@/types/task";
import { Project } from "@/types/project";
import { isAfter, isSameDay, startOfWeek, format } from "date-fns";
import {
  RefreshCw,
  Mail,
  LogOut,
  Check,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Activity,
  FolderKanban,
  Lock,
  Settings2,
  ChevronRight,
  ArrowLeft,
  Crown,
  Users,
  EyeOff,
  HardDriveUpload,
} from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import { ProfilePictureManager } from "@/components/profile/profile-picture-manager";
import { UserAvatar } from "@/components/ui/user-avatar";

// ─── Workload Status Computation ───────────────────────────────────────────

type WorkloadStatus = "light" | "balanced" | "heavy" | "critical";

function computeWorkload(active: number, overdue: number): WorkloadStatus {
  if (overdue > 3 || active > 10) return "critical";
  if (overdue > 1 || active > 6) return "heavy";
  if (active > 2) return "balanced";
  return "light";
}

const WORKLOAD_CONFIG: Record<WorkloadStatus, { label: string; color: string; bar: string }> = {
  light:    { label: "Light",    color: "text-[#888888]",  bar: "bg-[#888888]/50 w-1/4" },
  balanced: { label: "Balanced", color: "text-[#ededed]",  bar: "bg-[#ededed]/80 w-2/4" },
  heavy:    { label: "Heavy",    color: "text-[#E57A7A]",  bar: "bg-[#E57A7A]/80 w-3/4" },
  critical: { label: "Critical", color: "text-[#E57A7A]",  bar: "bg-[#E57A7A] w-full shadow-[0_0_12px_rgba(229,122,122,0.3)]" },
};

// ─── Owner Capabilities Matrix ─────────────────────────────────────────────

const OWNER_CAPABILITIES = [
  { label: "Create & Delete Projects",  granted: true  },
  { label: "Invite Team Members",       granted: true  },
  { label: "Manage All Org Tasks",      granted: true  },
  { label: "View Team Workload",        granted: true  },
  { label: "Edit Own Profile",          granted: true  },
  { label: "Account Security Controls", granted: true  },
];

const MEMBER_CAPABILITIES = [
  { label: "Create & Delete Projects",  granted: false },
  { label: "Invite Team Members",       granted: false },
  { label: "Manage Assigned Tasks",     granted: true  },
  { label: "View Team Workload",        granted: false },
  { label: "Edit Own Profile",          granted: true  },
  { label: "Account Security Controls", granted: true  },
];

// ─── Stat Card ─────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="group relative bg-[#0A0A0A] rounded-[24px] p-8 flex flex-col gap-6 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[#111111] hover:-translate-y-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ring-1 ring-white/[0.02]">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center relative z-10", accent || "bg-[#111111] border border-white/[0.04]")}>
        <Icon className={cn("w-4 h-4", accent ? "text-[#E57A7A]" : "text-[#888888]")} />
      </div>
      <div className="relative z-10 space-y-1">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#555555]">{label}</p>
        <p className="text-3xl font-light tracking-tight text-[#ededed]">{value}</p>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Data state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form state (editable fields only)
  const [name, setName] = useState("");
  const [roleDescriptor, setRoleDescriptor] = useState("");
  const [bio, setBio] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Security state
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Load operational data
  const loadData = useCallback(async () => {
    if (!user?.orgId) return;
    try {
      const [taskData, projectData] = await Promise.allSettled([
        getTasksByOrg(user.orgId),
        getProjectsByOrg(user.orgId),
      ]);
      setTasks(taskData.status === "fulfilled" ? taskData.value : []);
      setProjects(projectData.status === "fulfilled" ? projectData.value : []);
    } catch (err) {
      console.error("Profile data load failed", err);
    } finally {
      setDataLoading(false);
      setRefreshing(false);
    }
  }, [user?.orgId]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else {
        setName(user.name || "");
        setRoleDescriptor((user as any).roleDescriptor || "");
        setBio((user as any).bio || "");
        loadData();
      }
    }
  }, [authLoading, user, router, loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const handleSave = async () => {
    if (!user || isSaving) return;
    const hasChanges =
      name.trim() !== user.name ||
      roleDescriptor !== ((user as any).roleDescriptor || "") ||
      bio !== ((user as any).bio || "");
    if (!hasChanges || !name.trim()) return;

    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await updateDoc(doc(db, "users", user.id), {
        name: name.trim(),
        roleDescriptor: roleDescriptor.trim(),
        bio: bio.trim(),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error("Profile save failed", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await firebaseSignOut();
      router.push("/login");
    } catch (err) {
      console.error("Sign out failed", err);
    } finally {
      setIsSigningOut(false);
    }
  };

  if (authLoading || dataLoading) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center gap-6">
        <Loader />
        <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#555555]">
          Resolving Profile
        </span>
      </div>
    );
  }

  if (!user) return null;

  // ── Operational metrics (role-aware) ──────────────────────────────────────
  const isOwner = user.role === "OWNER";
  const now = new Date();
  const weekStart = startOfWeek(now);

  const relevantTasks = isOwner
    ? tasks
    : tasks.filter((t) => t.assignedTo.includes(user.id));

  const activeTasks = relevantTasks.filter((t) => t.status !== "done");
  const overdueTasks = activeTasks.filter(
    (t) =>
      t.dueDate &&
      isAfter(now, t.dueDate.toDate()) &&
      !isSameDay(now, t.dueDate.toDate())
  );
  const completedThisWeek = relevantTasks.filter(
    (t) =>
      t.status === "done" &&
      t.completedAt &&
      isAfter(t.completedAt.toDate(), weekStart)
  );

  const workloadStatus = computeWorkload(activeTasks.length, overdueTasks.length);
  const workloadCfg = WORKLOAD_CONFIG[workloadStatus];

  // ── Projects involved ─────────────────────────────────────────────────────
  const involvedProjectIds = new Set(relevantTasks.map((t) => t.projectId));
  const involvedProjects = isOwner
    ? projects
    : projects.filter((p) => involvedProjectIds.has(p.id));

  // ── Save gate ─────────────────────────────────────────────────────────────
  const hasChanges =
    name.trim() !== user.name ||
    roleDescriptor !== ((user as any).roleDescriptor || "") ||
    bio !== ((user as any).bio || "");

  const capabilities = isOwner ? OWNER_CAPABILITIES : MEMBER_CAPABILITIES;
  const joinDate = user.createdAt?.toDate
    ? format(user.createdAt.toDate(), "MMM yyyy")
    : "—";

  return (
    <DashboardShell className="bg-[#050505] text-[#ededed] min-h-[100dvh] selection:bg-white/10 selection:text-white font-sans sm:pb-24">
      <div className="max-w-6xl mx-auto px-6 sm:px-12 animate-in fade-in duration-700">

        {/* ── Navigation Layer ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-24 tracking-tight pt-8">
          <div
            className="flex items-center gap-5 cursor-pointer group"
            onClick={() => router.push("/dashboard")}
          >
            <div className="w-10 h-10 rounded-xl bg-[#0A0A0A] border border-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] flex items-center justify-center relative overflow-hidden transition-all duration-300 group-hover:bg-[#111111] group-hover:-translate-y-[1px]">
              <ArrowLeft className="w-4 h-4 text-[#888888] group-hover:text-[#ededed] transition-colors" />
            </div>
            <span className="text-[12px] font-mono font-medium text-[#888888] group-hover:text-[#ededed] transition-colors uppercase tracking-[0.2em]">
              Dashboard
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 w-[212px]">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-transparent border border-transparent hover:bg-[#111111] text-[#888888] hover:text-[#ededed] transition-all disabled:opacity-50 outline-none shrink-0"
            >
              <RefreshCw
                className={cn(
                  "w-4 h-4 transition-transform duration-700",
                  refreshing && "animate-spin"
                )}
              />
            </button>

            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges || !name.trim()}
              className="group flex items-center h-10 w-10 hover:w-[160px] rounded-lg overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] bg-[#ededed] text-[#050505] font-medium hover:bg-white hover:-translate-y-[2px] disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:bg-[#ededed] disabled:cursor-not-allowed shadow-[0_2px_12px_rgba(255,255,255,0.06)] outline-none shrink-0"
            >
              <div className="flex items-center justify-center w-10 h-10 shrink-0">
                {isSaving ? (
                  <Loader size={14} stroke={2.5} color="#050505" className="animate-spin" />
                ) : saveSuccess ? (
                  <Check className="w-4 h-4 text-[#050505]" />
                ) : (
                  <HardDriveUpload className="w-4 h-4 text-[#050505]" />
                )}
              </div>
              
              <div className="relative flex-1 h-full">
                {/* Default state */}
                <div className={cn(
                  "absolute inset-0 flex items-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  !isSaving && !saveSuccess ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none"
                )}>
                  <span className="opacity-0 -translate-x-3 whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100 group-hover:translate-x-0 text-[13px] font-bold tracking-tight pr-4">
                    Save Changes
                  </span>
                </div>

                {/* Saving state */}
                <div className={cn(
                  "absolute inset-0 flex items-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  isSaving ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0 pointer-events-none"
                )}>
                  <span className="opacity-0 -translate-x-3 whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100 group-hover:translate-x-0 text-[13px] font-bold tracking-tight pr-4">
                    Saving
                  </span>
                </div>

                {/* Success state */}
                <div className={cn(
                  "absolute inset-0 flex items-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  saveSuccess ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none"
                )}>
                  <span className="opacity-0 -translate-x-3 whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100 group-hover:translate-x-0 text-[13px] font-bold tracking-tight pr-4">
                    Saved
                  </span>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* ══ SECTION 1: Profile Header ════════════════════════════════ */}
        <ScrollReveal className="mb-24">
          <span className="text-[10px] font-mono text-[#555555] uppercase tracking-[0.3em] block mb-10 pl-2">
            Operational Identity
          </span>
          <div className="flex flex-col lg:flex-row items-start gap-12">

            {/* Avatar Management */}
            <div className="flex-shrink-0">
              <ProfilePictureManager user={user} />
            </div>

            {/* Identity Block */}
            <div className="flex-1 space-y-5 pt-2">
              <div>
                <h1 className="text-4xl font-light text-[#ededed] leading-none tracking-tight mb-4">
                  {user.name}
                </h1>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="px-3 py-1.5 flex items-center gap-2 rounded-md border border-white/[0.04] bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] text-[12px] font-medium text-[#ededed]">
                    {isOwner ? (
                      <Crown className="w-3.5 h-3.5 text-[#888888]" />
                    ) : (
                      <Users className="w-3.5 h-3.5 text-[#888888]" />
                    )}
                    <span className="capitalize">{user.role}</span>
                  </div>
                  {(user as any).roleDescriptor && (
                    <span className="text-[13px] text-[#888888] font-light italic">
                      {(user as any).roleDescriptor}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-8 pt-1">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-[#555555]" />
                  <span className="text-[13px] font-mono text-[#888888]">{user.email}</span>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* ══ SECTION 2: Personal Overview ════════════════════════════ */}
        <ScrollReveal delay={100} className="mb-24">
          <div className="space-y-8">
            <div className="flex items-center justify-between pl-2">
              <span className="text-[10px] font-mono text-[#555555] uppercase tracking-[0.3em]">
                {isOwner ? "Workspace Overview" : "Operational Overview"}
              </span>
              <div className={cn("flex items-center gap-2", workloadCfg.color)}>
                <Activity className="w-3.5 h-3.5" />
                <span className="text-[10px] font-mono uppercase tracking-[0.2em]">
                  {workloadCfg.label} Workload
                </span>
              </div>
            </div>

            {/* Stat Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                icon={Activity}
                label="Active Tasks"
                value={activeTasks.length}
              />
              <StatCard
                icon={AlertTriangle}
                label="Overdue"
                value={overdueTasks.length}
                accent={overdueTasks.length > 0 ? "bg-[#E57A7A]/10 border border-[#E57A7A]/20" : undefined}
              />
              <StatCard
                icon={CheckCircle2}
                label="Done This Week"
                value={completedThisWeek.length}
              />
              <StatCard
                icon={FolderKanban}
                label={isOwner ? "Org Projects" : "My Projects"}
                value={involvedProjects.length}
              />
            </div>

            {/* Workload Bar */}
            <div className="bg-[#0A0A0A] rounded-[24px] px-8 py-6 flex items-center gap-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ring-1 ring-white/[0.02]">
              <span className="text-[9px] font-mono text-[#555555] uppercase tracking-[0.3em] flex-shrink-0">
                Pressure
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-[#1A1A1A] overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-1000", workloadCfg.bar)} />
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* ══ SECTION 3 + 4: Account Info & Role ═════════════════════ */}
        <ScrollReveal delay={150} className="mb-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">

            {/* Account Information */}
            <div className="space-y-8">
              <span className="text-[10px] font-mono text-[#555555] uppercase tracking-[0.3em] block pl-2">
                Account Information
              </span>
              <div className="bg-[#0A0A0A] rounded-[32px] p-10 h-[calc(100%-2rem)] space-y-8 ring-1 ring-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                
                {/* Editable: Name */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[9px] font-mono text-[#555555] uppercase tracking-[0.3em]">
                      Full Name
                    </Label>
                    <span className="text-[8px] font-mono text-[#888888] uppercase tracking-widest">Editable</span>
                  </div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#111111] border border-white/[0.04] rounded-xl h-12 px-5 text-[14px] font-light text-[#ededed] placeholder:text-[#333333] transition-all focus:outline-none focus:border-[#555555] shadow-inner"
                  />
                </div>

                {/* Editable: Role Descriptor */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[9px] font-mono text-[#555555] uppercase tracking-[0.3em]">
                      Descriptor
                    </Label>
                    <span className="text-[8px] font-mono text-[#888888] uppercase tracking-widest">Editable</span>
                  </div>
                  <input
                    value={roleDescriptor}
                    onChange={(e) => setRoleDescriptor(e.target.value)}
                    placeholder="e.g. Lead Engineer, Design Lead..."
                    className="w-full bg-[#111111] border border-white/[0.04] rounded-xl h-12 px-5 text-[14px] font-light text-[#ededed] placeholder:text-[#333333] transition-all focus:outline-none focus:border-[#555555] shadow-inner"
                  />
                </div>

                {/* Editable: Bio */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[9px] font-mono text-[#555555] uppercase tracking-[0.3em]">
                      Bio
                    </Label>
                    <span className="text-[8px] font-mono text-[#888888] uppercase tracking-widest">Editable</span>
                  </div>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Describe your focus area..."
                    className="w-full bg-[#111111] border border-white/[0.04] rounded-xl p-5 text-[14px] font-light text-[#ededed] min-h-[140px] resize-none placeholder:text-[#333333] transition-all focus:outline-none focus:border-[#555555] shadow-inner"
                  />
                </div>

                {/* Read-only: Email */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[9px] font-mono text-[#555555] uppercase tracking-[0.3em]">
                      Authentication Email
                    </Label>
                    <span className="text-[8px] font-mono text-[#555555] uppercase tracking-widest flex items-center gap-1.5">
                      <Lock className="w-2.5 h-2.5" />System
                    </span>
                  </div>
                  <div className="flex items-center gap-4 px-5 h-12 bg-[#050505] rounded-xl border border-white/[0.02] cursor-not-allowed">
                    <Mail className="w-4 h-4 text-[#555555]" />
                    <span className="text-[13px] font-mono text-[#888888]">{user.email}</span>
                  </div>
                </div>

              </div>
            </div>

            {/* Role & Permissions */}
            <div className="space-y-8">
              <span className="text-[10px] font-mono text-[#555555] uppercase tracking-[0.3em] block pl-2">
                Capabilities
              </span>
              <div className="bg-[#0A0A0A] rounded-[32px] p-10 h-[calc(100%-2rem)] space-y-8 ring-1 ring-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                
                {/* Role badge */}
                <div className="flex items-center gap-5 pb-8 border-b border-white/[0.04]">
                  <div className="w-14 h-14 rounded-2xl bg-[#111111] border border-white/[0.04] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                    {isOwner
                      ? <Crown className="w-6 h-6 text-[#ededed]" />
                      : <Users className="w-6 h-6 text-[#ededed]" />}
                  </div>
                  <div>
                    <p className="text-[9px] font-mono text-[#555555] uppercase tracking-[0.3em] mb-1">
                      Assigned Role
                    </p>
                    <h3 className="text-xl font-light text-[#ededed] capitalize border-b border-transparent">{user.role}</h3>
                  </div>
                </div>

                {/* Capability Matrix */}
                <div className="space-y-3">
                  <p className="text-[9px] font-mono text-[#555555] uppercase tracking-[0.3em] mb-4">
                    Access Matrix
                  </p>
                  {capabilities.map((cap, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-4 py-3.5 px-5 rounded-2xl transition-colors",
                        cap.granted ? "bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]" : "bg-transparent border border-white/[0.02]"
                      )}
                    >
                      <div className={cn(
                        "w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 relative overflow-hidden",
                      )}>
                        <div className={cn("absolute inset-0 opacity-20", cap.granted ? "bg-[#ededed]" : "")} />
                        {cap.granted
                          ? <Check className="w-3.5 h-3.5 text-[#ededed] relative z-10" />
                          : <EyeOff className="w-3.5 h-3.5 text-[#555555] relative z-10" />}
                      </div>
                      <span className={cn(
                        "text-[13px] font-light",
                        cap.granted ? "text-[#ededed]" : "text-[#555555]"
                      )}>
                        {cap.label}
                      </span>
                    </div>
                  ))}
                </div>



              </div>
            </div>

          </div>
        </ScrollReveal>

        {/* ══ SECTION 5: Assigned Projects ════════════════════════════ */}
        <ScrollReveal delay={200} className="mb-24">
          <div className="space-y-8">
            <div className="flex items-center justify-between pl-2">
              <span className="text-[10px] font-mono text-[#555555] uppercase tracking-[0.3em]">
                {isOwner ? "All Projects" : "My Projects"}
              </span>
              <span className="text-[10px] font-mono text-[#888888] uppercase tracking-[0.2em]">
                {involvedProjects.length} active
              </span>
            </div>

            {involvedProjects.length === 0 ? (
              <div className="bg-[#0A0A0A] rounded-[24px] p-16 flex flex-col items-center gap-6 text-center ring-1 ring-white/[0.02]">
                <FolderKanban className="w-8 h-8 text-[#333333]" />
                <div>
                  <p className="text-[14px] text-[#888888] font-light">No projects assigned</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {involvedProjects.map((project, i) => {
                  const projectTasks = tasks.filter((t) => t.projectId === project.id);
                  const projectActive = projectTasks.filter((t) => t.status !== "done").length;
                  const projectDone = projectTasks.filter((t) => t.status === "done").length;
                  const total = projectTasks.length;
                  const progress = total > 0 ? Math.round((projectDone / total) * 100) : 0;

                  return (
                    <div
                      key={project.id}
                      className="group relative bg-[#0A0A0A] rounded-[24px] p-8 flex flex-col justify-between h-[180px] cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[#111111] hover:-translate-y-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ring-1 ring-white/[0.02]"
                      onClick={() => router.push(`/projects/${project.id}`)}
                    >
                      <div className="relative z-10 flex items-start justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-[#111111] border border-white/[0.04] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                          <FolderKanban className="w-4 h-4 text-[#888888]" />
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#555555] group-hover:text-[#ededed] transition-colors" />
                      </div>
                      <div className="relative z-10 space-y-1.5 mb-6">
                        <h3 className="text-[15px] font-medium text-[#ededed] tracking-tight leading-tight">
                          {project.name}
                        </h3>
                        <p className="text-[11px] text-[#888888] font-mono">
                          {projectActive} active · {projectDone} done
                        </p>
                      </div>
                      <div className="relative z-10 w-full mt-auto">
                        <div className="h-1 rounded-full bg-[#1A1A1A] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#ededed]/60 transition-all duration-1000"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollReveal>

        {/* ══ SECTION 7: Security ═════════════════════════════════════ */}
        <ScrollReveal delay={250} className="mb-24">
          <div className="space-y-8">
            <span className="text-[10px] font-mono text-[#E57A7A]/60 uppercase tracking-[0.3em] block pl-2">
              Security
            </span>
            <div className="bg-[#050505] rounded-[32px] p-10 flex flex-col md:flex-row items-center justify-between gap-10 ring-1 ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
              <div className="space-y-2 text-center md:text-left">
                <div className="flex items-center gap-3 mb-1 justify-center md:justify-start">
                  <div className="w-8 h-8 rounded-lg bg-[#E57A7A]/10 flex items-center justify-center">
                    <LogOut className="w-3.5 h-3.5 text-[#E57A7A]" />
                  </div>
                  <h3 className="text-lg font-light text-[#ededed] tracking-tight">
                    End Session
                  </h3>
                </div>
                <p className="text-[13px] text-[#888888] font-light max-w-sm leading-relaxed">
                  Securely clear local workspace context and sign out of OrbitOS.
                </p>
              </div>
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="h-12 px-8 rounded-xl shrink-0 flex items-center justify-center gap-2 bg-[#111111] hover:bg-[#1A1A1A] text-[#E57A7A] border border-[#E57A7A]/20 transition-all duration-300 outline-none w-full md:w-auto"
              >
                {isSigningOut ? (
                  <Loader size={14} stroke={2} color="#E57A7A" className="animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4 opacity-80" />
                )}
                <span className="text-[13px] font-medium tracking-tight">
                  {isSigningOut ? "Signing Out..." : "Sign Out"}
                </span>
              </button>
            </div>
          </div>
        </ScrollReveal>

      </div>
    </DashboardShell>
  );
}
