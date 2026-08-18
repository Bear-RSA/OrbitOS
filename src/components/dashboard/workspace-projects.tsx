"use client";

import { useState } from "react";
import { ProjectHealth } from "@/types/dashboard";
import { Project } from "@/types/project";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/classnames";
import { ArrowUpRight, TrendingUp, TrendingDown, Minus, ChevronUp, ChevronDown, GripVertical, Save, X } from "lucide-react";
import { updateProjectPriorityAction } from "@/app/actions/projects";
import { ActionButton, MeterBar } from "./dashboard-card";
import { themeColor } from "@/lib/theme/colors";

interface WorkspaceProjectsProps {
  projectsHealth?: ProjectHealth[];
  projects?: Project[];
  orgId?: string;
  userId?: string;
  isOwner?: boolean;
  onRefresh?: () => void;
}

export function WorkspaceProjects({ projectsHealth, projects, orgId, userId, isOwner, onRefresh }: WorkspaceProjectsProps) {
  const router = useRouter();
  const [reordering, setReordering] = useState(false);
  const [saving, setSaving] = useState(false);

  // Handle both owner view (projectsHealth) and member view (projects array)
  // Reconstruct a unified interface for rendering
  const initialDisplayProjects = projectsHealth 
    ? projectsHealth.map(ph => ({
        id: ph.project.id,
        name: ph.project.name,
        description: ph.project.description || "Project execution environment.",
        status: ph.status === "healthy" ? "Healthy" : ph.status === "watch" ? "Watch" : "At Risk",
        progress: ph.healthScore, // Aligning with project pulse health score
        priority: ph.project.priority,
      }))
    : projects?.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description || "Project execution environment.",
        status: "Healthy",
        progress: 100,
        priority: p.priority,
      })) || [];

  const [orderedProjects, setOrderedProjects] = useState(initialDisplayProjects);

  // Sync if props change while not reordering
  const displayProjects = reordering ? orderedProjects : initialDisplayProjects;

  const moveProject = (index: number, direction: "up" | "down") => {
    const newOrder = [...orderedProjects];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setOrderedProjects(newOrder);
  };

  const startReordering = () => {
    setOrderedProjects([...initialDisplayProjects]);
    setReordering(true);
  };

  const cancelReordering = () => {
    setReordering(false);
    setOrderedProjects(initialDisplayProjects);
  };

  const saveOrder = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const priorities = orderedProjects.map((p, i) => ({
        projectId: p.id,
        priority: i + 1,
      }));
      const result = await updateProjectPriorityAction({ uid: userId, priorities });
      if (result.success) {
        setReordering(false);
        onRefresh?.();
      } else {
        console.error("[WorkspaceProjects] Priority save failed:", result.error);
      }
    } catch (err) {
      console.error("[WorkspaceProjects] Priority save error:", err);
    } finally {
      setSaving(false);
    }
  };

  if (displayProjects.length === 0) return null;

  return (
    <div className="w-full">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="mb-3 text-2xl font-light tracking-tight text-ink sm:text-3xl">Active Projects</h2>
          <div className="inline-flex items-center gap-2 rounded-full bg-surface-control px-3 py-1 ring-1 ring-inset ring-line/[0.07]">
             <span className="h-1.5 w-1.5 rounded-full bg-orbit-green shadow-[0_0_8px_rgb(var(--orbit-green)_/_0.4)]" aria-hidden />
             <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">Ecosystem Tracking</span>
          </div>
        </div>

        {/* Project Priority Controls — Owner only */}
        {isOwner && (
          <div className="flex items-center gap-2">
            {!reordering ? (
              <ActionButton icon={GripVertical} label="Project Priority" onClick={startReordering} />
            ) : (
              <>
                <ActionButton
                  icon={Save}
                  label={saving ? "Saving…" : "Save Order"}
                  onClick={saveOrder}
                  disabled={saving}
                />
                <ActionButton icon={X} label="Cancel" variant="ghost" onClick={cancelReordering} />
              </>
            )}
          </div>
        )}
      </div>

      <div className="mb-16 grid grid-cols-1 gap-5 md:grid-cols-2">
        {displayProjects.map((project, i) => (
          <ScrollReveal key={project.id} delay={i * 80}>
             <div onClick={() => !reordering && router.push(`/projects/${project.id}`)} className={cn("h-full", reordering ? "cursor-default" : "cursor-pointer")}>
              <InteractiveCard className="group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl p-6 ring-1 ring-inset ring-line/[0.06] sm:p-8">
                {/* Reorder Controls */}
                {reordering && (
                  <div className="absolute right-4 top-4 z-10 flex flex-col gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); moveProject(i, "up"); }}
                      disabled={i === 0}
                      aria-label={`Move ${project.name} up`}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-control text-ink-muted ring-1 ring-inset ring-line/[0.08] transition-colors hover:bg-surface-active hover:text-ink disabled:cursor-not-allowed disabled:opacity-25"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveProject(i, "down"); }}
                      disabled={i === displayProjects.length - 1}
                      aria-label={`Move ${project.name} down`}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-control text-ink-muted ring-1 ring-inset ring-line/[0.08] transition-colors hover:bg-surface-active hover:text-ink disabled:cursor-not-allowed disabled:opacity-25"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Status Glow — previously `bg-orbit-red/05`, an invalid opacity
                    modifier that Tailwind dropped, so this never rendered. */}
                {project.status === "At Risk" && (
                  <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-orbit-red/[0.07] blur-[60px]" aria-hidden />
                )}

                <div>
                  <div className="mb-6 flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-3">
                      <div className="flex items-center gap-2">
                        {project.status === "Healthy" ? (
                          <TrendingUp className="h-3.5 w-3.5 shrink-0 text-orbit-green" aria-hidden />
                        ) : project.status === "At Risk" ? (
                          <TrendingDown className="h-3.5 w-3.5 shrink-0 text-orbit-red" aria-hidden />
                        ) : (
                          <Minus className="h-3.5 w-3.5 shrink-0 text-orbit-amber" aria-hidden />
                        )}
                        <span className={cn(
                          "font-mono text-[10px] uppercase tracking-[0.16em]",
                          project.status === "Healthy" ? "text-orbit-green" :
                          project.status === "At Risk" ? "text-orbit-red" : "text-orbit-amber"
                        )}>
                          {project.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="truncate text-xl font-light text-ink transition-colors group-hover:text-ink-strong sm:text-2xl">{project.name}</h3>
                        {/* Priority Badge */}
                        {project.priority != null && (
                          <span className="shrink-0 rounded-md bg-surface-control px-1.5 py-1 font-mono text-[10px] leading-none text-ink-muted ring-1 ring-inset ring-line/[0.08]">
                            P{project.priority}
                          </span>
                        )}
                      </div>
                    </div>
                    {!reordering && (
                      <div className="shrink-0 p-1 text-ink-dim transition-colors group-hover:text-ink">
                         <ArrowUpRight className="h-5 w-5 opacity-0 transition-all duration-300 group-hover:opacity-100" aria-hidden />
                      </div>
                    )}
                  </div>

                  <p className="mb-8 line-clamp-2 max-w-sm text-[13px] font-light leading-relaxed text-ink-muted">
                    {project.description}
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em]">
                     <span className="text-ink-dim">Health Indicator</span>
                     <span className={cn(
                       "tabular-nums",
                       project.status === "At Risk" ? "text-orbit-red" : project.status === "Watch" ? "text-orbit-amber" : "text-orbit-green"
                     )}>
                        {project.progress > 0 ? project.progress.toFixed(0) : 0}%
                     </span>
                  </div>
                  <MeterBar
                    value={project.progress}
                    color={project.status === "At Risk" ? themeColor.red : project.status === "Watch" ? themeColor.amber : themeColor.green}
                  />
                </div>
              </InteractiveCard>
             </div>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
