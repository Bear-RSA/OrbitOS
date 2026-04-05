"use client";

import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Loader } from "@/components/ui/loader";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { InteractiveCard } from "@/components/ui/interactive-card";
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
import { getDashboardData } from "@/lib/queries/dashboard";

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
      <div className="min-h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center gap-6">
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
    <DashboardShell className="bg-[#050505] text-[#ededed] min-h-screen selection:bg-white/10 selection:text-white">
      {/* Top nav */}
      <div className="flex items-center justify-between mb-24 tracking-tight pt-4">
        <div className="flex items-center gap-5 cursor-pointer group" onClick={() => router.push("/dashboard")}>
          <div className="w-10 h-10 rounded-xl bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.5)] flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none"></div>
            <Image src="/logo.png" alt="OrbitOS Logo" fill className="object-cover z-10" />
          </div>
          <span className="text-[17px] font-medium text-[#ededed] tracking-tight group-hover:text-white transition-colors">OrbitOS</span>
        </div>
        
        <div className="flex items-center gap-5">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-full bg-transparent hover:bg-[#111111] text-[#888888] hover:text-[#ededed] transition-all focus:outline-none ring-0",
              refreshing && "animate-spin text-[#666666]"
            )}
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setAddMemberOpen(true)}
            className="gap-2.5 hidden sm:flex items-center justify-center bg-[#ededed] hover:bg-white hover:-translate-y-[2px] text-[#050505] shadow-[0_2px_12px_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.3)] hover:shadow-[0_4px_20px_rgba(255,255,255,0.12),0_12px_32px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-lg px-6 h-10 text-[13px] font-bold tracking-tight focus:outline-none ring-0"
          >
            <UserPlus className="w-4 h-4" />
            Invite Member
          </button>

          <button
            onClick={() => router.push("/profile")}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-[#111111] hover:bg-[#1a1a1a] hover:-translate-y-[2px] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none ring-0 relative overflow-hidden group"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <span className="text-[13px] font-medium relative z-10">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </button>
        </div>
      </div>

      {/* Header */}
      <ScrollReveal>
        <div className="mb-24">
          <h2 className="text-5xl font-light tracking-tighter text-[#ededed] mb-6">Core Team</h2>
          <div className="flex items-center gap-4">
            <div className="px-3 py-1 bg-[#111111] rounded-full ring-1 ring-white/[0.04] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A078FF] shadow-[0_0_8px_rgba(160,120,255,0.4)]" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#888888]">Active Deployment</span>
            </div>
            <span className="text-[13px] text-[#666666] font-mono">{MOCK_TEAM.length + 1} Active Members</span>
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
                  <div className="w-16 h-16 rounded-full overflow-hidden border border-white/[0.06] bg-[#111111]">
                    <img src={member.avatar} alt={member.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                  </div>
                  <div className={cn(
                    "absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-4 border-[#0A0A0A] z-10",
                    member.status === "active" ? "bg-emerald-500" : member.status === "busy" ? "bg-[#A078FF]" : "bg-zinc-600"
                  )} />
                </div>
                <div className="text-right">
                  <h3 className="text-xl font-light text-[#ededed]">{member.name}</h3>
                  <p className="text-[11px] font-mono text-[#666666] uppercase tracking-widest mt-1">{member.role}</p>
                </div>
              </div>

              <div className="mb-10">
                <p className="text-[10px] font-mono text-[#444444] uppercase tracking-widest mb-4">Focus Module</p>
                <div className="bg-[#050505]/40 rounded-xl p-4 ring-1 ring-white/[0.04]">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[13px] font-light text-[#ededed]">{member.focus}</span>
                    <span className="text-[11px] font-mono text-[#A078FF]">{member.progress}%</span>
                  </div>
                  <div className="w-full h-1 bg-[#111111] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#A078FF] rounded-full transition-all duration-1000" 
                      style={{ width: `${member.progress}%` }} 
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-white/[0.04]">
                <span className="text-[10px] font-mono text-[#666666] uppercase tracking-widest flex items-center gap-2">
                  {member.availability}
                </span>
                <button className="text-[#333333] hover:text-[#ededed] transition-colors">
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
            <h3 className="text-2xl font-light text-[#ededed] tracking-tight">External Partners</h3>
            <div className="h-px flex-1 bg-gradient-to-r from-white/[0.06] to-transparent" />
            <span className="text-[10px] font-mono text-[#444444] uppercase tracking-widest">Orbit Network</span>
          </div>

          <div className="space-y-3">
            {EXTERNAL_PARTNERS.map(partner => (
              <div 
                key={partner.id} 
                className="grid grid-cols-1 md:grid-cols-5 items-center px-8 py-5 bg-[#0A0A0A] rounded-2xl ring-1 ring-white/[0.04] hover:bg-[#111111] transition-all group"
              >
                <div className="flex items-center gap-4 col-span-2">
                  <div className="w-10 h-10 rounded-xl bg-[#111111] ring-1 ring-white/[0.04] flex items-center justify-center text-[#666666] font-mono text-[10px]">
                    {partner.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-[14px] font-light text-[#ededed]">{partner.name}</p>
                    <p className="text-[10px] font-mono text-[#555555] uppercase tracking-widest">{partner.type}</p>
                  </div>
                </div>
                <div className="text-[13px] text-[#666666] font-light">{partner.specialty}</div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    partner.status === "Available" ? "bg-emerald-500" : partner.status === "Wrapping Up" ? "bg-amber-500" : "bg-[#333333]"
                  )} />
                  <span className="text-[10px] font-mono text-[#666666] uppercase tracking-widest">{partner.status}</span>
                </div>
                <div className="text-right">
                  <button className="text-[10px] font-mono uppercase tracking-widest text-[#A078FF] hover:text-white transition-colors">
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 pt-16 border-t border-white/[0.04] pb-32">
          <div>
            <p className="text-[10px] font-mono text-[#444444] uppercase tracking-widest mb-3">Saturation</p>
            <p className="text-4xl font-light tracking-tighter text-[#ededed]">74.2%</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-[#444444] uppercase tracking-widest mb-3">Velocity</p>
            <p className="text-4xl font-light tracking-tighter text-[#A078FF]">1.4x</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-[#444444] uppercase tracking-widest mb-3">System Health</p>
            <p className="text-4xl font-light tracking-tighter text-[#ededed]">Optimal</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-[#444444] uppercase tracking-widest mb-3">Coverage</p>
            <p className="text-4xl font-light tracking-tighter text-[#ededed]">Global</p>
          </div>
        </div>
      </ScrollReveal>

      {/* Modals */}
      <ProfileModal
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={currentMember}
      />
      <AddMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        orgId={user.orgId || ""}
        invitedBy={user.id}
      />
    </DashboardShell>
  );
}
