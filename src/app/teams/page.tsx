"use client";

import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Loader } from "@/components/ui/loader";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { AppNav } from "@/components/nav/app-nav";
import { ProfileModal } from "@/components/dashboard/profile-modal";
import { AddMemberDialog } from "@/components/members/add-member-dialog";
import { 
  UserPlus, 
  RefreshCw, 
  MoreHorizontal, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  ExternalLink,
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import { Member } from "@/types/member";

const MOCK_TEAM = [
  {
    id: "1",
    name: "Sarah Chen",
    email: "sarah@orbit.os",
    role: "Design Lead",
    status: "active",
    availability: "Available for new projects",
    focus: "OrbitOS Core UI Kit",
    progress: 82,
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&auto=format&fit=crop&q=80"
  },
  {
    id: "2",
    name: "Marcus Thorne",
    email: "marcus@orbit.os",
    role: "Systems Arch",
    status: "busy",
    availability: "Deep Work Mode",
    focus: "Data Pipeline Integrity",
    progress: 45,
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&auto=format&fit=crop&q=80"
  },
  {
    id: "3",
    name: "Elena Rodriguez",
    email: "elena@orbit.os",
    role: "Sr. Strategist",
    status: "away",
    availability: "Over capacity",
    focus: "Q4 Growth Roadmap",
    progress: 95,
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=400&auto=format&fit=crop&q=80"
  }
];

const EXTERNAL_PARTNERS = [
  {
    id: "e1",
    name: "Julian Vo",
    type: "Freelance",
    specialty: "3D Visualization",
    project: "Neural Link Rendering",
    status: "Available"
  },
  {
    id: "e2",
    name: "Studio Arca",
    type: "Agency",
    specialty: "Motion Graphics",
    project: "Brand Reveal v2",
    status: "Wrapping Up"
  },
  {
    id: "e3",
    name: "Lukas Weber",
    type: "Independent",
    specialty: "Cloud Infrastructure",
    project: "AWS Migration",
    status: "Off-duty"
  }
];

export default function TeamsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [dataLoading, setDataLoading] = useState(true);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  // Seat controls are owner-only; createInviteAction re-checks server-side.
  const isOwner = user?.role === "OWNER";
  const [profileOpen, setProfileOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else {
        // Simulate data load
        setTimeout(() => setDataLoading(false), 800);
      }
    }
  }, [authLoading, user, router]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  if (authLoading || dataLoading) {
    return (
      <div className="min-h-[100dvh] w-full bg-base flex flex-col items-center justify-center gap-6">
        <Loader />
      </div>
    );
  }

  if (!user) return null;

  const currentMember: Member = {
    id: user.id,
    email: user.email,
    name: user.name,
    orgId: user.orgId || "",
    role: user.role,
    createdAt: user.createdAt,
  };

  return (
    <DashboardShell className="bg-base text-ink min-h-screen selection:bg-surface-hover selection:text-ink-strong">
      {/* Top nav */}
      <div className="flex items-center justify-between mb-24 tracking-tight pt-4">
        <div className="flex items-center gap-5 cursor-pointer group" onClick={() => router.push("/dashboard")}>
          <div className="w-10 h-10 rounded-xl bg-surface-control shadow-raised flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-sheen/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none"></div>
            <Image src="/logo.png" alt="OrbitOS Logo" fill className="object-cover rounded-[inherit] z-10" />
          </div>
          <span className="text-[17px] font-medium text-ink tracking-tight group-hover:text-ink-strong transition-colors">OrbitOS</span>
        </div>

        <AppNav uid={user?.id} orgId={user?.orgId} className="ml-4 mr-auto" />
        
        <div className="flex items-center gap-5">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-full bg-transparent hover:bg-surface-control text-ink-muted hover:text-ink transition-all focus:outline-none ring-0",
              refreshing && "animate-spin text-ink-dim"
            )}
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {isOwner && (
          <button
            onClick={() => setAddMemberOpen(true)}
            className="gap-2.5 hidden sm:flex items-center justify-center bg-ink hover:bg-ink-strong hover:-translate-y-[2px] text-on-ink shadow-[0_2px_12px_rgb(var(--ink-strong)_/_0.06),0_8px_24px_rgb(var(--scrim)_/_0.3)] hover:shadow-[0_4px_20px_rgb(var(--ink-strong)_/_0.12),0_12px_32px_rgb(var(--scrim)_/_0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-lg px-6 h-10 text-[13px] font-bold tracking-tight focus:outline-none ring-0"
          >
            <UserPlus className="w-4 h-4" />
            Invite Member
          </button>
          )}

          <button
            onClick={() => router.push("/profile")}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-surface-control hover:bg-surface-hover hover:-translate-y-[2px] text-ink shadow-[inset_0_1px_0_rgb(var(--ink-strong)_/_0.06),0_2px_8px_rgb(var(--scrim)_/_0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none ring-0 relative overflow-hidden group"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-sheen/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <span className="text-[13px] font-medium relative z-10">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </button>
        </div>
      </div>

      {/* Header */}
      <ScrollReveal>
        <div className="mb-24">
          <h2 className="text-5xl font-light tracking-tighter text-ink mb-6">Core Team</h2>
          <div className="flex items-center gap-4">
            <div className="px-3 py-1 bg-surface-control rounded-full ring-1 ring-line/[0.04] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-ink-strong shadow-[0_0_8px_rgb(var(--ink-strong)_/_0.4)]" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-ink-muted">Active Deployment</span>
            </div>
            <span className="text-[13px] text-ink-dim font-mono">{MOCK_TEAM.length + 1} Active Members</span>
          </div>
        </div>
      </ScrollReveal>

      {/* Team Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-32">
        {MOCK_TEAM.map((member, i) => (
          <ScrollReveal key={member.id} delay={i * 100}>
            <InteractiveCard className="p-8 group h-full">
              <div className="flex items-start justify-between mb-8">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full overflow-hidden border border-line/[0.06] bg-surface-control">
                    <img src={member.avatar} alt={member.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                  </div>
                  <div className={cn(
                    "absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-4 border-line/[0.04] z-10",
                    member.status === "active" ? "bg-emerald-500" : member.status === "busy" ? "bg-ink-strong shadow-[0_0_8px_rgb(var(--ink-strong)_/_0.4)]" : "bg-zinc-600"
                  )} />
                </div>
                <div className="text-right">
                  <h3 className="text-xl font-light text-ink">{member.name}</h3>
                  <p className="text-[11px] font-mono text-ink-dim uppercase tracking-widest mt-1">{member.role}</p>
                </div>
              </div>

              <div className="mb-10">
                <p className="text-[10px] font-mono text-ink-faint uppercase tracking-widest mb-4">Focus Module</p>
                <div className="bg-base/40 rounded-xl p-4 ring-1 ring-line/[0.04]">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[13px] font-light text-ink">{member.focus}</span>
                    <span className="text-[11px] font-mono text-ink-strong">{member.progress}%</span>
                  </div>
                  <div className="w-full h-1 bg-surface-control rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-ink-strong rounded-full transition-all duration-1000" 
                      style={{ width: `${member.progress}%` }} 
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-line/[0.04]">
                <span className="text-[10px] font-mono text-ink-dim uppercase tracking-widest flex items-center gap-2">
                  {member.availability}
                </span>
                <button className="text-ink-faint hover:text-ink transition-colors">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
            </InteractiveCard>
          </ScrollReveal>
        ))}
      </div>

      {/* External Partners */}
      <ScrollReveal delay={400}>
        <div className="mb-32">
          <div className="flex items-center gap-4 mb-12">
            <h3 className="text-2xl font-light text-ink tracking-tight">External Partners</h3>
            <div className="h-px flex-1 bg-gradient-to-r from-line/[0.06] to-transparent" />
            <span className="text-[10px] font-mono text-ink-faint uppercase tracking-widest">Orbit Network</span>
          </div>

          <div className="space-y-3">
            {EXTERNAL_PARTNERS.map(partner => (
              <div 
                key={partner.id} 
                className="grid grid-cols-1 md:grid-cols-5 items-center px-8 py-5 bg-surface-sunken rounded-2xl ring-1 ring-line/[0.04] hover:bg-surface-control transition-all group"
              >
                <div className="flex items-center gap-4 col-span-2">
                  <div className="w-10 h-10 rounded-xl bg-surface-control ring-1 ring-line/[0.04] flex items-center justify-center text-ink-dim font-mono text-[10px]">
                    {partner.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-[14px] font-light text-ink">{partner.name}</p>
                    <p className="text-[10px] font-mono text-ink-dim uppercase tracking-widest">{partner.type}</p>
                  </div>
                </div>
                <div className="text-[13px] text-ink-dim font-light">{partner.specialty}</div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    partner.status === "Available" ? "bg-emerald-500" : partner.status === "Wrapping Up" ? "bg-amber-500" : "bg-surface-highest"
                  )} />
                  <span className="text-[10px] font-mono text-ink-dim uppercase tracking-widest">{partner.status}</span>
                </div>
                <div className="text-right">
                  <button className="text-[10px] font-mono uppercase tracking-widest text-ink hover:text-ink-strong transition-colors">
                    Assign Task
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>

      {/* Stats Footer */}
      <ScrollReveal delay={500}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 pt-16 border-t border-line/[0.04] pb-32">
          <div>
            <p className="text-[10px] font-mono text-ink-faint uppercase tracking-widest mb-3">Saturation</p>
            <p className="text-4xl font-light tracking-tighter text-ink">74.2%</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-ink-faint uppercase tracking-widest mb-3">Velocity</p>
            <p className="text-4xl font-light tracking-tighter text-ink">1.4x</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-ink-faint uppercase tracking-widest mb-3">System Health</p>
            <p className="text-4xl font-light tracking-tighter text-ink">Optimal</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-ink-faint uppercase tracking-widest mb-3">Coverage</p>
            <p className="text-4xl font-light tracking-tighter text-ink">Global</p>
          </div>
        </div>
      </ScrollReveal>

      {/* Modals */}
      <ProfileModal
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={currentMember}
      />
      {isOwner && (
      <AddMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        orgId={user.orgId || ""}
        invitedBy={user.id}
      />
      )}
    </DashboardShell>
  );
}
