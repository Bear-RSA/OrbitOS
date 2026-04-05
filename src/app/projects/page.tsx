"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Loader } from "@/components/ui/loader";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { CreateProjectDialog } from "@/components/dashboard/create-project-dialog";
import { 
  Plus, 
  RefreshCw, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  Users, 
  ArrowUpRight,
  MoreHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import { Member } from "@/types/member";

const MOCK_PROJECTS = [
  {
    id: "p1",
    name: "Neural Link Rendering",
    description: "High-fidelity 3D visualization for neuro-interface prototypes.",
    status: "Active",
    progress: 74,
    owner: "Sarah Chen",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&auto=format&fit=crop&q=80",
    deadline: "Nov 15, 2024",
    priority: "High",
    teamSize: 4
  },
  {
    id: "p2",
    name: "Architectural Void SDK",
    description: "Design system core components for OrbitOS ecosystem.",
    status: "Delayed",
    progress: 42,
    owner: "Marcus Thorne",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&auto=format&fit=crop&q=80",
    deadline: "Oct 30, 2024",
    priority: "Urgent",
    teamSize: 3
  },
  {
    id: "p3",
    name: "Data Stream Integrity",
    description: "Encryption protocols and stream validation modules.",
    status: "Completed",
    progress: 100,
    owner: "Elena Rodriguez",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&h=100&auto=format&fit=crop&q=80",
    deadline: "Oct 10, 2024",
    priority: "Normal",
    teamSize: 5
  },
  {
    id: "p4",
    name: "Quantum Ledger v2",
    description: "Distributed state-sync engine for cross-cluster operations.",
    status: "Planning",
    progress: 12,
    owner: "Julian Vo",
    avatar: "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=100&h=100&auto=format&fit=crop&q=80",
    deadline: "Dec 22, 2024",
    priority: "Low",
    teamSize: 2
  }
];

export default function ProjectsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [dataLoading, setDataLoading] = useState(true);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else {
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
      {/* Navigation Layer */}
      <div className="flex items-center justify-between mb-24 tracking-tight pt-4">
        <div className="flex items-center gap-5 cursor-pointer group" onClick={() => router.push("/dashboard")}>
          <div className="w-10 h-10 rounded-xl bg-[#111111] flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none"></div>
            <Image src="/logo.png" alt="OrbitOS Logo" fill className="object-cover z-10" />
          </div>
          <span className="text-[17px] font-medium text-[#ededed] tracking-tight group-hover:text-white transition-colors uppercase tracking-[0.2em]">OrbitOS</span>
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
            onClick={() => setCreateProjectOpen(true)}
            className="gap-2.5 hidden sm:flex items-center justify-center bg-[#ededed] hover:bg-white hover:-translate-y-[2px] text-[#050505] shadow-[0_2px_12px_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.3)] hover:shadow-[0_4px_20px_rgba(255,255,255,0.12),0_12px_32px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-lg px-6 h-10 text-[13px] font-bold tracking-tight focus:outline-none ring-0"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>

          <button
            onClick={() => router.push("/profile")}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-[#111111] hover:bg-[#1a1a1a] hover:-translate-y-[1px] text-[#ededed] shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none ring-0 relative overflow-hidden group"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <span className="text-[13px] font-medium relative z-10">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </button>
        </div>
      </div>

      {/* Hero Header */}
      <ScrollReveal>
        <div className="mb-24">
          <h2 className="text-5xl font-light tracking-tighter text-[#ededed] mb-6">Active Projects</h2>
          <div className="flex items-center gap-6">
            <div className="px-3 py-1 bg-[#111111] rounded-full flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A078FF] shadow-[0_0_8px_rgba(160,120,255,0.4)]" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#888888]">Ecosystem Tracking</span>
            </div>
            <p className="text-[14px] text-[#666666] font-light max-w-xl">
              Central execution surface for all integrated vectors. Manage trajectory, risk, and deployment velocity.
            </p>
          </div>
        </div>
      </ScrollReveal>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-32">
        {MOCK_PROJECTS.map((project, i) => (
          <ScrollReveal key={project.id} delay={i * 100}>
            <InteractiveCard className="p-10 group h-full flex flex-col justify-between overflow-hidden relative">
              {/* Status Glow - Reduced opacity to 5% */}
              {project.status === "Delayed" && (
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#E57A7A]/05 blur-[60px] pointer-events-none" />
              )}
              
              <div>
                <div className="flex justify-between items-start mb-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      {project.status === "Completed" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500/80" />
                      ) : project.status === "Delayed" ? (
                        <AlertCircle className="w-4 h-4 text-[#E57A7A]/80" />
                      ) : (
                        <div className="w-3.5 h-3.5 flex items-center justify-center">
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            project.status === "Active" ? "bg-[#A078FF]/80" : "bg-[#333333]"
                          )} />
                        </div>
                      )}
                      <span className={cn(
                        "text-[10px] font-mono uppercase tracking-[0.1em]",
                        project.status === "Active" ? "text-[#ededed]" : "text-[#555555]"
                      )}>
                        {project.status}
                      </span>
                    </div>
                    <h3 className="text-2xl font-light text-[#ededed] group-hover:text-white transition-colors">{project.name}</h3>
                  </div>
                  {/* Simplified Arrow Animation: Opacity only */}
                  <div className="text-[#333333] group-hover:text-[#666666] transition-colors p-2">
                    <ArrowUpRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-all duration-300" />
                  </div>
                </div>

                <p className="text-[14px] text-[#666666] font-light leading-relaxed mb-12 max-w-sm">
                  {project.description}
                </p>
              </div>

              <div>
                <div className="space-y-8">
                  {/* Progress Bar - Reduced height to 1px */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-[10px] font-mono tracking-widest text-[#444444]">
                      <span className="uppercase">Deployment</span>
                      <span className={cn(
                        project.progress === 100 ? "text-emerald-500/80" : "text-[#A078FF]/80"
                      )}>
                        {project.progress}%
                      </span>
                    </div>
                    <div className="w-full h-[1px] bg-[#0A0A0A] rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full transition-all duration-1000",
                          project.status === "Completed" ? "bg-emerald-500/80" : "bg-[#A078FF]/80"
                        )} 
                        style={{ width: `${project.progress}%` }} 
                      />
                    </div>
                  </div>

                  {/* Metadata Row - Horizontal Alignment Layout */}
                  <div className="flex items-center justify-between py-4 bg-white/[0.01] px-6 -mx-10">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full overflow-hidden bg-[#111111]">
                        <img src={project.avatar} alt={project.owner} className="w-full h-full object-cover grayscale opacity-40 group-hover:opacity-80 transition-opacity" />
                      </div>
                      <p className="text-[12px] font-light text-[#888888]">{project.owner}</p>
                    </div>

                    <div className="flex items-center gap-8">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-[#333333]" />
                        <span className="text-[10px] font-mono text-[#555555] uppercase tracking-widest">{project.deadline}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-3 h-3 text-[#333333]" />
                        <span className="text-[10px] font-mono text-[#555555] uppercase tracking-widest">{project.teamSize} NODE</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </InteractiveCard>
          </ScrollReveal>
        ))}
      </div>

      {/* Stats Layer - Embedded Tonal Layout */}
      <ScrollReveal delay={400}>
        <div className="mt-32 bg-[#0A0A0A] rounded-2xl px-12 py-16 grid grid-cols-2 lg:grid-cols-4 gap-12 pb-32">
          <div>
            <p className="text-[10px] font-mono text-[#444444] uppercase tracking-widest mb-3">Health Score</p>
            <p className="text-4xl font-light tracking-tighter text-[#ededed]">88.4</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-[#444444] uppercase tracking-widest mb-3">Resource Load</p>
            <p className="text-4xl font-light tracking-tighter text-[#A078FF]/80">64%</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-[#444444] uppercase tracking-widest mb-3">Delivery Velocity</p>
            <p className="text-4xl font-light tracking-tighter text-[#ededed]">1.2x</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-[#444444] uppercase tracking-widest mb-3">Active Threads</p>
            <p className="text-4xl font-light tracking-tighter text-[#ededed]">14</p>
          </div>
        </div>
      </ScrollReveal>

      {/* UI Modals */}
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        orgId={user.orgId || ""}
        ownerId={user.id}
        onSuccess={handleRefresh}
      />
    </DashboardShell>
  );
}
