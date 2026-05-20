"use client";

import { ProjectHealth } from "@/types/dashboard";
import { Project } from "@/types/project";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/classnames";
import { CheckCircle2, AlertCircle, ArrowUpRight, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface WorkspaceProjectsProps {
  projectsHealth?: ProjectHealth[];
  projects?: Project[];
}

export function WorkspaceProjects({ projectsHealth, projects }: WorkspaceProjectsProps) {
  const router = useRouter();

  // Handle both owner view (projectsHealth) and member view (projects array)
  // Reconstruct a unified interface for rendering
  const displayProjects = projectsHealth 
    ? projectsHealth.map(ph => ({
        id: ph.project.id,
        name: ph.project.name,
        description: "Project execution environment.",
        status: ph.status === "healthy" ? "Healthy" : ph.status === "watch" ? "Watch" : "At Risk",
        progress: ph.healthScore, // Aligning with project pulse health score
      }))
    : projects?.map(p => ({
        id: p.id,
        name: p.name,
        description: "Project execution environment.",
        status: "Healthy",
        progress: 100,
      })) || [];

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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
        {displayProjects.map((project, i) => (
          <ScrollReveal key={project.id} delay={i * 80}>
             <div onClick={() => router.push(`/projects/${project.id}`)} className="cursor-pointer h-full">
              <InteractiveCard className="p-10 group h-full flex flex-col justify-between overflow-hidden relative">
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
                      <h3 className="text-2xl font-light text-[#ededed] group-hover:text-white transition-colors">{project.name}</h3>
                    </div>
                    <div className="text-[#333333] group-hover:text-[#666666] transition-colors p-2">
                       <ArrowUpRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-all duration-300" />
                    </div>
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
