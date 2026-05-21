"use client";

import React from "react";
import { FolderPlus, UserPlus, Plus, SignalLow } from "lucide-react";

import { cn } from "@/lib/utils/classnames";

interface EmptyDashboardStateProps {
  type: "no_projects" | "no_tasks" | "no_team" | "no_assigned_work";
  isOwner: boolean;
  onCreateProject?: () => void;
  onInviteMember?: () => void;
}

export function EmptyDashboardState({ type, isOwner, onCreateProject, onInviteMember }: EmptyDashboardStateProps) {
  const configs = {
    no_projects: {
      title: isOwner ? "System Awaiting Signal" : "Workspace Connected",
      description: isOwner
        ? "OrbitOS is currently inactive. To begin surfacing telemetry on project health, team workload variance, and task clarity, initialize your first workspace module."
        : "No active projects yet. Initialize a project to start tracking work and collaborating with your team.",
      icon: FolderPlus,
      action: (
        <button 
          onClick={onCreateProject} 
          className="gap-3 inline-flex items-center justify-center bg-gradient-to-b from-[#222222] to-[#151515] hover:from-[#2a2a2a] hover:to-[#1a1a1a] hover:-translate-y-[2px] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-xl px-10 h-12 text-[11px] font-mono uppercase tracking-[0.25em] focus:outline-none ring-0 group"
        >
          <Plus className="w-4 h-4 text-[#888888]" />
          Create Project
        </button>
      )
    },
    no_tasks: {
      title: "Clean Slate Output",
      description: "Project infrastructure is online, but no operational tasks have been mapped. Define your first delivery nodes to start tracking performance.",
      icon: SignalLow,
      action: (
        <button 
          className="gap-3 inline-flex items-center justify-center bg-gradient-to-b from-[#222222] to-[#151515] hover:from-[#2a2a2a] hover:to-[#1a1a1a] hover:-translate-y-[2px] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-xl px-10 h-12 text-[11px] font-mono uppercase tracking-[0.25em] focus:outline-none ring-0 group"
        >
          <Plus className="w-4 h-4 text-[#888888]" />
          Add First Task
        </button>
      )
    },
    no_assigned_work: {
      title: "All Clear",
      description: "You have no active tasks right now. When your team assigns work to you, it will appear here with full context and priority.",
      icon: CheckCircle2Icon,
      action: null
    },
    no_team: {
      title: "Solo Protocol",
      description: "You are the only active operator in this workspace. Invite collaborators to start mapping team workload and capacity.",
      icon: UserPlus,
      action: isOwner ? (
        <button 
          onClick={onInviteMember}
          className="gap-3 inline-flex items-center justify-center bg-gradient-to-b from-[#222222] to-[#151515] hover:from-[#2a2a2a] hover:to-[#1a1a1a] hover:-translate-y-[2px] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-xl px-10 h-12 text-[11px] font-mono uppercase tracking-[0.25em] focus:outline-none ring-0 group"
        >
          <UserPlus className="w-4 h-4 text-[#888888]" />
          Invite Team
        </button>
      ) : null
    }
  };

  const config = configs[type];
  const Icon = config.icon;

  return (
    <div className="rounded-[24px] bg-[#0A0A0A] ring-1 ring-white/[0.04] p-12 md:p-20 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] animate-in fade-in slide-in-from-bottom-2 duration-700">
      <div className="absolute top-0 right-0 w-full h-[120%] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/[0.02] via-transparent to-transparent pointer-events-none"></div>
      
      <div className="relative z-10 max-w-2xl">
        <div className="w-12 h-12 rounded-xl bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.4)] flex items-center justify-center mb-10">
          <Icon className="w-5 h-5 text-[#888888]" />
        </div>
        
        <h2 className="text-[28px] font-light text-[#ededed] tracking-tight mb-4">
          {config.title}
        </h2>
        
        <p className="text-[15px] text-[#888888] font-light leading-relaxed mb-12 max-w-lg">
          {config.description}
        </p>
        
        {config.action}
        {!isOwner && type !== "no_assigned_work" && (
          <div className="inline-flex items-center gap-3 px-6 h-12 rounded-xl bg-[#111111] border border-white/[0.04]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#ededed]/40 shadow-[0_0_8px_rgba(237,237,237,0.2)] animate-pulse" />
            <span className="text-[13px] text-[#888888] font-medium tracking-wide">Your workspace is ready — waiting for assignments</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckCircle2Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
