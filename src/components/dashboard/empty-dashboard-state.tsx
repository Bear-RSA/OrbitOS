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
          className="group inline-flex h-12 items-center justify-center gap-3 rounded-xl bg-surface-hover px-8 font-mono text-[11px] uppercase tracking-[0.2em] text-ink ring-1 ring-inset ring-line/[0.1] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px] hover:bg-surface-active hover:ring-line/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Plus className="h-4 w-4 text-ink-muted transition-colors group-hover:text-ink" aria-hidden />
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
          className="group inline-flex h-12 items-center justify-center gap-3 rounded-xl bg-surface-hover px-8 font-mono text-[11px] uppercase tracking-[0.2em] text-ink ring-1 ring-inset ring-line/[0.1] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px] hover:bg-surface-active hover:ring-line/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Plus className="h-4 w-4 text-ink-muted transition-colors group-hover:text-ink" aria-hidden />
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
          className="group inline-flex h-12 items-center justify-center gap-3 rounded-xl bg-surface-hover px-8 font-mono text-[11px] uppercase tracking-[0.2em] text-ink ring-1 ring-inset ring-line/[0.1] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px] hover:bg-surface-active hover:ring-line/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <UserPlus className="h-4 w-4 text-ink-muted transition-colors group-hover:text-ink" aria-hidden />
          Invite Team
        </button>
      ) : null
    }
  };

  const config = configs[type];
  const Icon = config.icon;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 relative overflow-hidden rounded-3xl bg-surface-card p-8 shadow-card ring-1 ring-inset ring-line/[0.06] duration-700 sm:p-12 md:p-16">
      <div className="pointer-events-none absolute right-0 top-0 h-[120%] w-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-line/[0.035] via-transparent to-transparent"></div>

      <div className="relative z-10 max-w-2xl">
        <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-control shadow-card ring-1 ring-inset ring-line/[0.08]">
          <Icon className="h-5 w-5 text-ink-muted" aria-hidden />
        </div>

        <h2 className="mb-3 text-2xl font-light tracking-tight text-ink sm:text-[28px]">
          {config.title}
        </h2>

        <p className="mb-8 max-w-lg text-[14px] font-light leading-relaxed text-ink-muted">
          {config.description}
        </p>

        {/* Wrapped so the CTA and the status pill can't collide — previously
            they rendered as adjacent inline-flex boxes with no gap. */}
        <div className="flex flex-wrap items-center gap-4">
          {config.action}
          {!isOwner && type !== "no_assigned_work" && (
            <div className="inline-flex h-12 items-center gap-3 rounded-xl bg-surface-control px-5 ring-1 ring-inset ring-line/[0.07]">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink/50 shadow-[0_0_8px_rgb(var(--ink)_/_0.2)]" aria-hidden />
              <span className="text-[13px] font-medium tracking-wide text-ink-muted">Your workspace is ready — waiting for assignments</span>
            </div>
          )}
        </div>
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
