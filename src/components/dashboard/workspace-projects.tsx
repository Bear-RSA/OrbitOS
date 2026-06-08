"use client";

import { useState } from "react";
import { ProjectHealth } from "@/types/dashboard";
import { Project } from "@/types/project";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/classnames";
import { CheckCircle2, AlertCircle, ArrowUpRight, TrendingUp, TrendingDown, Minus, ChevronUp, ChevronDown, GripVertical, Save, X } from "lucide-react";
import { updateProjectPriorityAction } from "@/app/actions/projects";

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
        description: "Project execution environment.",
        status: ph.status === "healthy" ? "Healthy" : ph.status === "watch" ? "Watch" : "At Risk",
        progress: ph.healthScore, // Aligning with project pulse health score
        priority: ph.project.priority,
      }))
    : projects?.map(p => ({
        id: p.id,
        name: p.name,
        description: "Project execution environment.",
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
      <div className="mb-12">
        <h2 className="text-3xl font-light tracking-tighter text-[#ededed] mb-4">Active Projects</h2>
        <div className="flex items-center gap-6">
          <div className="px-3 py-1 bg-[#111111] rounded-full flex items-center gap-2">
             <span className="w-1.5 h-1.5 rounded-full bg-orbit-green shadow-[0_0_8px_rgba(133,200,155,0.4)]" />
             <span className="text-[10px] font-mono uppercase tracking-widest text-[#888888]">Ecosystem Tracking</span>
          </div>
        </div>

        {/* Project Priority Button — Owner only, below Ecosystem Tracking */}
        {isOwner && (
          <div className="flex items-center gap-3 mt-4">
            {!reordering ? (
              <button
                onClick={startReordering}
                className="group flex items-center bg-gradient-to-b from-[#222222] to-[#151515] hover:from-[#2a2a2a] hover:to-[#1a1a1a] hover:-translate-y-[1px] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-md h-9 px-4 overflow-hidden focus:outline-none ring-0"
              >
                <GripVertical className="w-3.5 h-3.5 text-[#888888] transition-colors group-hover:text-[#ededed] mr-2" />
                <span className="text-[10px] font-mono uppercase tracking-[0.2em]">
                  Project Priority
                </span>
              </button>
            ) : (
              <>
                <button
                  onClick={saveOrder}
                  disabled={saving}
                  className="group flex items-center bg-gradient-to-b from-[#222222] to-[#151515] hover:from-[#2a2a2a] hover:to-[#1a1a1a] hover:-translate-y-[1px] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-md h-9 px-4 overflow-hidden focus:outline-none ring-0 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5 text-orbit-green transition-colors group-hover:text-[#ededed] mr-2" />
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em]">
                    {saving ? "Saving..." : "Save Order"}
                  </span>
                </button>
                <button
                  onClick={cancelReordering}
                  className="group flex items-center bg-gradient-to-b from-[#222222] to-[#151515] hover:from-[#2a2a2a] hover:to-[#1a1a1a] hover:-translate-y-[1px] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-md h-9 px-4 overflow-hidden focus:outline-none ring-0"
                >
                  <X className="w-3.5 h-3.5 text-[#888888] transition-colors group-hover:text-[#ededed] mr-2" />
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em]">
                    Cancel
                  </span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
        {displayProjects.map((project, i) => (
          <ScrollReveal key={project.id} delay={i * 80}>
             <div onClick={() => !reordering && router.push(`/projects/${project.id}`)} className={cn("h-full", reordering ? "cursor-default" : "cursor-pointer")}>
              <InteractiveCard className="p-10 group h-full flex flex-col justify-between overflow-hidden relative">
                {/* Reorder Controls */}
                {reordering && (
                  <div className="absolute top-4 right-4 flex flex-col gap-1 z-10">
                    <button
                      onClick={(e) => { e.stopPropagation(); moveProject(i, "up"); }}
                      disabled={i === 0}
                      className="w-7 h-7 flex items-center justify-center rounded bg-[#111111] border border-[#1a1a1a] text-[#888888] hover:text-[#ededed] hover:bg-[#1a1a1a] transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveProject(i, "down"); }}
                      disabled={i === displayProjects.length - 1}
                      className="w-7 h-7 flex items-center justify-center rounded bg-[#111111] border border-[#1a1a1a] text-[#888888] hover:text-[#ededed] hover:bg-[#1a1a1a] transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Status Glow */}
                {project.status === "At Risk" && (
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#E57A7A]/05 blur-[60px] pointer-events-none" />
                )}
                
                <div>
                  <div className="flex justify-between items-start mb-8">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        {project.status === "Healthy" ? (
                          <div className="w-4 h-4 flex items-center justify-center">
                            <TrendingUp className="w-3.5 h-3.5 text-orbit-green/80" />
                          </div>
                        ) : project.status === "At Risk" ? (
                          <TrendingDown className="w-4 h-4 text-orbit-red/80" />
                        ) : (
                          <Minus className="w-4 h-4 text-orbit-amber/80" />
                        )}
                        <span className={cn(
                          "text-[10px] font-mono uppercase tracking-[0.1em]",
                          project.status === "Healthy" ? "text-[#ededed]" : "text-[#555555]"
                        )}>
                          {project.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-2xl font-light text-[#ededed] group-hover:text-white transition-colors">{project.name}</h3>
                        {/* Priority Badge */}
                        {project.priority != null && (
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#000000] border border-[#1a1a1a] text-[#888888] leading-none">
                            P{project.priority}
                          </span>
                        )}
                      </div>
                    </div>
                    {!reordering && (
                      <div className="text-[#333333] group-hover:text-[#666666] transition-colors p-2">
                         <ArrowUpRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-all duration-300" />
                      </div>
                    )}
                  </div>

                  <p className="text-[14px] text-[#666666] font-light leading-relaxed mb-12 max-w-sm line-clamp-2">
                    {project.description}
                  </p>
                </div>

                <div>
                   <div className="space-y-8">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-[10px] font-mono tracking-widest text-[#444444]">
                           <span className="uppercase">Health Indicator</span>
                           <span className={cn(
                             project.status === "At Risk" ? "text-orbit-red" : project.status === "Watch" ? "text-orbit-amber" : "text-orbit-green/80"
                           )}>
                              {project.progress > 0 ? project.progress.toFixed(0) : 0}%
                           </span>
                        </div>
                        <div className="w-full h-[1px] bg-[#0A0A0A] rounded-full overflow-hidden">
                           <div 
                             className={cn(
                               "h-full transition-all duration-1000",
                               project.status === "At Risk" ? "bg-orbit-red" : project.status === "Watch" ? "bg-orbit-amber" : "bg-orbit-green/80"
                             )} 
                             style={{ width: `${Math.max(project.progress, 5)}%` }} 
                           />
                        </div>
                      </div>
                   </div>
                </div>
              </InteractiveCard>
             </div>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
