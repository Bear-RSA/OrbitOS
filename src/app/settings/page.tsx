"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Loader } from "@/components/ui/loader";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { ProfileModal } from "@/components/dashboard/profile-modal";
import { 
  RefreshCw, 
  Shield, 
  Settings as SettingsIcon, 
  Wallet, 
  Cpu, 
  ChevronRight, 
  Eye, 
  Lock, 
  LogOut, 
  ChevronDown,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import { Member } from "@/types/member";

const SETTINGS_TABS = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "security", label: "Security", icon: Shield },
  { id: "billing", label: "Billing", icon: Wallet },
  { id: "integrations", label: "Integrations", icon: Cpu }
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [dataLoading, setDataLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("integrations");
  const [profileOpen, setProfileOpen] = useState(false);
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
      <div className="flex flex-col lg:flex-row gap-20">
        
        {/* Left Sidebar - Navigation Shell */}
        <div className="w-full lg:w-64 space-y-12">
          <div className="flex items-center gap-5 cursor-pointer group" onClick={() => router.push("/dashboard")}>
            <div className="w-10 h-10 rounded-xl bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.5)] flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none"></div>
              <Image src="/logo.png" alt="OrbitOS Logo" fill className="object-cover rounded-[inherit] z-10" />
            </div>
            <span className="text-[17px] font-medium text-[#ededed] tracking-tight group-hover:text-white transition-colors">OrbitOS</span>
          </div>

          <nav className="space-y-1.5">
            {SETTINGS_TABS.filter(tab => tab.id !== 'billing' || user.role === 'OWNER').map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-4 w-full px-5 py-3.5 rounded-xl transition-all duration-300",
                  activeTab === tab.id 
                    ? "bg-[#111111] text-[#A078FF] ring-1 ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]" 
                    : "text-[#555555] hover:text-[#ededed] hover:bg-white/[0.02]"
                )}
              >
                <tab.icon className={cn("w-4 h-4", activeTab === tab.id ? "opacity-100" : "opacity-40")} />
                <span className="text-[14px] font-light tracking-tight">{tab.label}</span>
              </button>
            ))}
          </nav>

          <div className="pt-12 border-t border-white/[0.04]">
            <button 
              onClick={() => router.push("/profile")}
              className="flex items-center gap-4 group w-full"
            >
              <div className="w-9 h-9 rounded-full bg-[#111111] flex items-center justify-center text-[#888888] font-light group-hover:text-[#ededed] transition-colors relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="relative z-10 text-xs">{user.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="text-left">
                <p className="text-[13px] font-light text-[#ededed] group-hover:text-white transition-colors">{user.name}</p>
                <p className="text-[10px] font-mono text-[#333333] uppercase tracking-[0.15em] leading-none mt-1">Admin_Root</p>
              </div>
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 max-w-4xl">
          {/* Header */}
          <ScrollReveal>
            <div className="mb-24">
              <h2 className="text-5xl font-light tracking-tighter text-[#ededed] mb-6">Workspace Settings</h2>
              <div className="flex items-center gap-4">
                <div className="px-3 py-1 bg-[#111111] rounded-full ring-1 ring-white/[0.04] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#A078FF] shadow-[0_0_8px_rgba(160,120,255,0.4)]" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#888888]">OS_STABLE_V2.0</span>
                </div>
                <p className="text-[13px] text-[#666666] font-light">Control center for cloud infrastructure and ecosystem nodes.</p>
              </div>
            </div>
          </ScrollReveal>

          {/* Settings Canvas */}
          <div className="space-y-32 pb-32">
            
            {/* Ecosystem Node Cluster */}
            <ScrollReveal delay={100}>
              <div className="space-y-12">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-mono uppercase tracking-widest text-[#444444]">Connected Ecosystem</h3>
                  <div className="flex items-center gap-2 opacity-50">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                    <span className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest">Active Connectivity</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Slack */}
                  <div className="bg-[#0A0A0A] rounded-2xl p-8 ring-1 ring-white/[0.04] hover:bg-[#111111] transition-all group">
                    <div className="flex justify-between items-start mb-12">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-xl bg-[#4A154B]/05 flex items-center justify-center ring-1 ring-[#4A154B]/20">
                          <Eye className="w-4 h-4 text-[#4A154B]" />
                        </div>
                        <div>
                          <h4 className="text-[15px] font-light text-[#ededed]">Slack</h4>
                          <span className="text-[10px] font-mono text-[#555555] uppercase tracking-widest mt-1 block">Protocol Active</span>
                        </div>
                      </div>
                      <ChevronDown className="w-4 h-4 text-[#333333] group-hover:text-[#666666] transition-colors" />
                    </div>
                    <div className="flex gap-4">
                      <button className="flex-1 h-10 bg-[#111111] hover:bg-[#1a1a1a] rounded-xl text-[12px] font-light text-[#888888] hover:text-[#ededed] transition-all ring-1 ring-white/[0.02]">
                        Configure
                      </button>
                      <button className="h-10 px-4 bg-transparent text-[#E57A7A]/30 hover:text-[#E57A7A] text-[12px] font-light transition-all">
                        Disconnect
                      </button>
                    </div>
                  </div>

                  {/* Figma */}
                  <div className="bg-[#0A0A0A] rounded-2xl p-8 ring-1 ring-white/[0.04] hover:bg-[#111111] transition-all group">
                    <div className="flex justify-between items-start mb-12">
                      <div className="flex items-center gap-4 opacity-40">
                        <div className="w-11 h-11 rounded-xl bg-[#F24E1E]/05 flex items-center justify-center ring-1 ring-[#F24E1E]/20">
                          <Eye className="w-4 h-4 text-[#F24E1E]" />
                        </div>
                        <div>
                          <h4 className="text-[15px] font-light text-[#ededed]">Figma</h4>
                          <span className="text-[10px] font-mono uppercase tracking-widest mt-1 block">Awaiting Auth</span>
                        </div>
                      </div>
                    </div>
                    <button className="w-full h-10 bg-gradient-to-b from-[#222222] to-[#151515] hover:from-[#2a2a2a] hover:to-[#1a1a1a] text-[#ededed] rounded-xl text-[12px] font-medium transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                      Connect Node
                    </button>
                  </div>
                </div>
              </div>
            </ScrollReveal>

            {/* Sync Protocol Surface */}
            <ScrollReveal delay={200}>
              <div className="space-y-10">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-light text-[#ededed]">Synchronization Protocols</h3>
                    <p className="text-[13px] text-[#666666] font-light mt-1">Real-time telemetry and data bridging across cluster.</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-[10px] font-mono text-[#444444] uppercase tracking-widest mb-1">Bandwidth</p>
                      <p className="text-[14px] font-mono text-[#ededed]">420 MB/S</p>
                    </div>
                    <button className="w-10 h-10 rounded-full bg-[#111111] ring-1 ring-white/[0.04] flex items-center justify-center text-[#888888] hover:text-[#ededed] transition-all">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="bg-[#0A0A0A] rounded-[32px] overflow-hidden group">
                  <div className="p-10 flex flex-wrap items-center justify-between gap-12 bg-gradient-to-r from-white/[0.02] to-transparent">
                    <div className="flex items-center gap-12">
                      <div>
                        <p className="text-[10px] font-mono text-[#555555] uppercase tracking-widest mb-3">Bridge Integrity</p>
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span className="text-2xl font-light text-[#ededed] tracking-tight">Active</span>
                        </div>
                      </div>
                      <div className="w-px h-12 bg-white/5 hidden md:block" />
                      <div>
                        <p className="text-[10px] font-mono text-[#555555] uppercase tracking-widest mb-3">Node Health</p>
                        <p className="text-2xl font-light text-[#ededed] tracking-tight">99.98%</p>
                      </div>
                    </div>
                    <button className="h-12 px-8 bg-transparent hover:bg-white/[0.02] ring-1 ring-white/[0.06] text-[#ededed] rounded-xl text-[13px] font-light transition-all flex items-center gap-3">
                      <RefreshCw className="w-4 h-4" />
                      Manual Sync Trigger
                    </button>
                  </div>

                  {/* Visualizer */}
                  <div className="h-16 w-full flex items-end gap-1 opacity-[0.2] px-10 pb-4 group-hover:opacity-[0.4] transition-opacity">
                    {[34, 56, 12, 89, 45, 67, 23, 91, 56, 21, 78, 43, 65, 32, 98, 45, 67, 12, 54, 32, 87, 43, 65, 21, 76, 54].map((h, i) => (
                      <div 
                        key={i} 
                        className="flex-1 bg-[#A078FF] rounded-full" 
                        style={{ height: `${h}%` }} 
                      />
                    ))}
                  </div>
                </div>
              </div>
            </ScrollReveal>

            {/* Danger Zone */}
            {user.role === 'OWNER' && (
              <ScrollReveal delay={300}>
                <div className="pt-24 border-t border-white/[0.04]">
                  <div className="flex flex-col gap-8 p-10 bg-[#0A0A0A] rounded-[24px] ring-1 ring-white/[0.04]">
                    <div>
                      <h3 className="text-lg font-light text-[#ededed]">Terminal Decommissioning</h3>
                      <p className="text-[13px] text-[#666666] font-light mt-1">Permanently remove this workspace and all telemetry data.</p>
                    </div>
                    <div className="flex items-center gap-6">
                      <button className="px-6 py-3 bg-[#E57A7A]/10 hover:bg-[#E57A7A]/20 text-[#E57A7A] rounded-xl text-[13px] font-medium transition-all">
                        Initialize Wipe
                      </button>
                      <div className="flex items-center gap-2 text-[#444444]">
                        <Lock className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-mono uppercase tracking-widest">Protocol Locked</span>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            )}

          </div>
        </div>
      </div>

      {/* Modals */}
      <ProfileModal
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={currentMember}
      />
    </DashboardShell>
  );
}
