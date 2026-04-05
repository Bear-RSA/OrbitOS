"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Loader } from "@/components/ui/loader";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { 
  RefreshCw, 
  User, 
  Mail, 
  Shield, 
  Calendar, 
  Cpu, 
  ArrowUpRight,
  LogOut,
  Check,
  Camera
} from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import { db } from "@/lib/firebase/client";
import { doc, updateDoc } from "firebase/firestore";
import { signOut as firebaseSignOut } from "@/lib/firebase/auth";
import { Label } from "@/components/ui/label";

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [dataLoading, setDataLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else {
        setName(user.name);
        setRole(user.role);
        setTimeout(() => setDataLoading(false), 800);
      }
    }
  }, [authLoading, user, router]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
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

  const handleSave = async () => {
    if (!user || isSaving || !name.trim()) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "users", user.id), {
        name: name.trim(),
        role: role.trim()
      });
      // In a real app, the auth-context would update this automatically or we'd trigger a reload
    } catch (err) {
      console.error("Failed to update profile", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || dataLoading) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#050505] flex flex-col items-center justify-center gap-6">
        <Loader />
      </div>
    );
  }

  if (!user) return null;

  return (
    <DashboardShell className="bg-[#121315] text-[#ededed] min-h-screen selection:bg-white/10 selection:text-white">
      {/* Navigation Layer */}
      <div className="flex items-center justify-between mb-24 tracking-tight pt-4">
        <div className="flex items-center gap-5 cursor-pointer group" onClick={() => router.push("/dashboard")}>
          <div className="w-10 h-10 rounded-xl bg-[#0d0e0f] flex items-center justify-center relative overflow-hidden">
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
              "flex items-center justify-center w-10 h-10 rounded-xl bg-transparent hover:bg-[#1f2021] text-[#666666] hover:text-[#ededed] transition-all focus:outline-none ring-0",
              refreshing && "animate-spin text-[#444444]"
            )}
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving || (name === user.name && role === user.role) || !name.trim()}
            className="gap-2.5 flex items-center justify-center bg-[#ededed] hover:bg-white hover:-translate-y-[2px] disabled:opacity-30 disabled:hover:translate-y-0 text-[#050505] shadow-[0_2px_12px_rgba(255,255,255,0.06)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] rounded-lg px-8 h-10 text-[13px] font-bold tracking-tight focus:outline-none ring-0"
          >
            {isSaving ? <Loader size={14} stroke={2} color="#050505" /> : <Check className="w-4 h-4" />}
            Internalized Changes
          </button>
        </div>
      </div>

      {/* Profile Editorial Header */}
      <ScrollReveal>
        <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-12 mb-32">
          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-12">
            <div className="relative group">
              <div className="w-32 h-32 rounded-[40px] overflow-hidden bg-[#1f2021] p-1 shadow-2xl">
                <div className="w-full h-full rounded-[38px] bg-[#0d0e0f] flex items-center justify-center overflow-hidden relative">
                  <span className="text-4xl font-light text-[#ededed] group-hover:opacity-20 transition-opacity">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <Camera className="w-6 h-6 text-[#a078ff]" />
                  </div>
                </div>
              </div>
              <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#a078ff] shadow-[0_0_12px_rgba(160,120,255,0.4)]" />
            </div>
            
            <div className="text-center lg:text-left space-y-4">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-mono text-[#555555] uppercase tracking-[0.3em]">Operational Identity</span>
                <h1 className="text-6xl font-light tracking-tighter text-[#ededed]">{user.name}</h1>
              </div>
              <div className="flex items-center justify-center lg:justify-start gap-4">
                <div className="px-3 py-1 bg-[#1f2021] rounded-full flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a078ff]" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#888888]">{user.role}</span>
                </div>
                <span className="text-[13px] text-[#666666] font-light">Root Node Administrator</span>
              </div>
            </div>
          </div>

          <div className="lg:text-right space-y-2">
            <p className="text-[10px] font-mono text-[#444444] uppercase tracking-widest">Initialization Vector</p>
            <p className="text-[14px] font-mono text-[#888888]">ID_NODE_{user.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>
      </ScrollReveal>

      {/* Interaction Surface Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-32">
        {/* Identity Matrix Field */}
        <ScrollReveal delay={100}>
          <div className="space-y-12">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#444444]">System Parameters</h3>
            <div className="bg-[#1f2021] rounded-[32px] p-12 space-y-12 h-full">
              <div className="space-y-4">
                <Label className="text-[10px] font-mono text-[#555555] uppercase tracking-widest ml-1">Legal Designation</Label>
                <input 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#0d0e0f] border-0 rounded-2xl h-14 px-6 text-[15px] font-light text-[#ededed] placeholder:text-[#333333] transition-all focus:outline-none focus:ring-1 focus:ring-[#a078ff]/30"
                />
              </div>
              <div className="space-y-4">
                <Label className="text-[10px] font-mono text-[#555555] uppercase tracking-widest ml-1">Operational Role</Label>
                <input 
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-[#0d0e0f] border-0 rounded-2xl h-14 px-6 text-[15px] font-light text-[#ededed] placeholder:text-[#333333] transition-all focus:outline-none focus:ring-1 focus:ring-[#a078ff]/30"
                />
              </div>
              <div className="space-y-4 pt-4">
                <p className="text-[10px] font-mono text-[#444444] uppercase tracking-widest mb-4">Authentication Endpoints</p>
                <div className="flex items-center gap-4 text-[#444444] px-6 py-4 bg-[#0d0e0f]/50 rounded-2xl">
                  <Mail className="w-4 h-4 opacity-40" />
                  <span className="text-[13px] font-mono">{user.email}</span>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Narrative Workspace */}
        <ScrollReveal delay={200}>
          <div className="space-y-12">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#444444]">Personal Narrative</h3>
            <div className="bg-[#1f2021] rounded-[32px] p-12 space-y-8 flex flex-col h-full">
              <div className="flex-1 space-y-4">
                <Label className="text-[10px] font-mono text-[#555555] uppercase tracking-widest ml-1">Node Bio</Label>
                <textarea 
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Describe operational responsibilities and bio parameters..."
                  className="w-full h-[280px] bg-[#0d0e0f] border-0 rounded-3xl p-8 text-[16px] font-light text-[#ededed] placeholder:text-[#333333] transition-all focus:outline-none focus:ring-1 focus:ring-[#a078ff]/30 resize-none leading-relaxed"
                />
              </div>
              <div className="pt-8 flex items-center justify-between border-t border-white/[0.04]">
                <div className="flex items-center gap-4">
                  <Calendar className="w-4 h-4 text-[#a078ff] opacity-40" />
                  <span className="text-[13px] font-light text-[#666666]">Node established Q4 2024</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-500/40" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#444444]">Verified Access</span>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>

      {/* Danger Environment */}
      <ScrollReveal delay={300}>
        <div className="space-y-12 pt-12 border-t border-white/[0.04] mb-32">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#444444]">System Termination</h3>
          <div className="bg-[#1A0A0A] rounded-[32px] p-12 flex flex-col md:flex-row items-center justify-between gap-12">
            <div>
              <h4 className="text-xl font-light text-[#E57A7A] mb-2 text-center md:text-left">Decommission Node Session</h4>
              <p className="text-[14px] text-[#666262] font-light text-center md:text-left">Ending this session will clear all local workspace telemetry caches.</p>
            </div>
            <button 
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="flex items-center gap-4 px-10 h-14 rounded-2xl bg-black/40 hover:bg-[#E57A7A]/10 text-[#E57A7A] transition-all group min-w-[220px] justify-center"
            >
              {isSigningOut ? <Loader size={16} stroke={2} color="#E57A7A" /> : <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />}
              <span className="text-[13px] font-bold tracking-tight uppercase">Sign Out</span>
            </button>
          </div>
        </div>
      </ScrollReveal>

      {/* Stats Footer */}
      <ScrollReveal delay={400}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 pb-32 opacity-20 grayscale">
          <div>
            <p className="text-[10px] font-mono text-[#444444] uppercase tracking-widest mb-3">Sync Continuity</p>
            <p className="text-4xl font-light tracking-tighter text-[#ededed]">100%</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-[#444444] uppercase tracking-widest mb-3">Node Latency</p>
            <p className="text-4xl font-light tracking-tighter text-[#ededed]">14ms</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-[#444444] uppercase tracking-widest mb-3">Buffer Velocity</p>
            <p className="text-4xl font-light tracking-tighter text-[#ededed]">Optimal</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-[#444444] uppercase tracking-widest mb-3">Protocol Integrity</p>
            <p className="text-4xl font-light tracking-tighter text-[#ededed]">High</p>
          </div>
        </div>
      </ScrollReveal>
    </DashboardShell>
  );
}
