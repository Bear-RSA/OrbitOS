"use client";

import { useState } from "react";
import { Users, UserPlus, UserMinus, X } from "lucide-react";
import { MemberWorkload } from "@/types/dashboard";
import { cn } from "@/lib/utils/classnames";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/contexts/auth-context";
import { DestructiveActionModal } from "@/components/ui/destructive-action-modal";
import { removeMemberAction } from "@/app/actions/members/removeMemberAction";

interface TeamWorkloadCardProps {
  memberWorkloads: MemberWorkload[];
  onInviteClick?: () => void;
}

const statusConfig = {
  light: { label: "Under Capacity", color: "text-[#5D6D7E]", ringAccent: "ring-[#5D6D7E]/10", barColor: "#5D6D7E", barWidth: "25%" },
  balanced: { label: "Optimal Flow", color: "text-[#85C89B]", ringAccent: "ring-[#85C89B]/10", barColor: "#85C89B", barWidth: "50%" },
  heavy: { label: "High Volume", color: "text-[#E5B567]", ringAccent: "ring-[#E5B567]/10", barColor: "#E5B567", barWidth: "75%" },
  "needs-attention": { label: "Critical Load", color: "text-[#E57A7A]", ringAccent: "ring-[#E57A7A]/12", barColor: "#E57A7A", barWidth: "95%" },
};

export function TeamWorkloadCard({ memberWorkloads, onInviteClick }: TeamWorkloadCardProps) {
  const { user } = useAuth();
  const [revokeMode, setRevokeMode] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const currentUserWorkload = memberWorkloads.find(w => w.member.id === user?.id);
  const isOwner = currentUserWorkload?.member.role === "OWNER";

  const handleRemove = async () => {
    if (!memberToRemove || !user?.id) return;
    setIsRemoving(true);
    try {
      const result = await removeMemberAction({
        targetUserId: memberToRemove,
        uid: user.id
      });
      if (result.success) {
        setMemberToRemove(null);
        const remainingRemovable = memberWorkloads.filter(w => w.member.id !== memberToRemove && w.member.role !== "OWNER" && w.member.id !== user?.id).length;
        if (remainingRemovable === 0) {
          setRevokeMode(false);
        }
      } else {
        console.error("Failed to remove:", result.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="rounded-[24px] p-10 animate-fade-in bg-[#0A0A0A]/50 hover:bg-[#0C0C0C] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ring-1 ring-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.01)] group/card">
      <div className="flex items-center justify-between mb-12">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.3em] text-[#444444] flex items-center gap-3">
          <Users className="w-3.5 h-3.5 text-[#333333]" />
          Operational Load Grid
        </h3>
        <div className="flex flex-col items-end gap-2 w-[140px]">
          {onInviteClick && (
            <button
              onClick={onInviteClick}
              className="group flex items-center bg-gradient-to-b from-[#222222] to-[#151515] hover:from-[#2a2a2a] hover:to-[#1a1a1a] hover:-translate-y-[1px] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.4)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-md h-8 w-8 hover:w-[140px] overflow-hidden focus:outline-none ring-0"
            >
              <div className="flex items-center justify-center w-8 h-8 shrink-0">
                <UserPlus className="w-3.5 h-3.5 text-[#888888] transition-colors group-hover:text-[#ededed]" />
              </div>
              <span className="opacity-0 -translate-x-3 whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100 group-hover:translate-x-0 text-[10px] font-mono uppercase tracking-[0.2em] pr-3">
                Invite Node
              </span>
            </button>
          )}
          {isOwner && memberWorkloads.length > 1 && (
            <button
              onClick={() => setRevokeMode(!revokeMode)}
              className={cn(
                "group flex items-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-0 rounded-md h-8 w-8 hover:w-[140px] overflow-hidden focus:outline-none ring-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.4)]",
                revokeMode 
                  ? "bg-orbit-red/10 text-orbit-red hover:bg-orbit-red/20 ring-1 ring-orbit-red/30" 
                  : "bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] hover:from-[#222222] hover:to-[#151515] text-[#888888] hover:text-[#aaaaaa] hover:-translate-y-[1px]"
              )}
            >
              <div className="flex items-center justify-center w-8 h-8 shrink-0">
                <UserMinus className="w-3.5 h-3.5" />
              </div>
              <span className="opacity-0 -translate-x-3 whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100 group-hover:translate-x-0 text-[10px] font-mono uppercase tracking-[0.2em] pr-3">
                {revokeMode ? "Done" : "Revoke"}
              </span>
            </button>
          )}
        </div>
      </div>

      {memberWorkloads.length === 0 ? (
        <div className="py-4 space-y-2">
          <p className="text-[15px] font-medium text-[#ededed]">Node network inactive.</p>
          <p className="text-[14px] text-[#666666] font-light leading-relaxed">Operational load metrics require primary operator assignment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {memberWorkloads.map((workload) => {
            const config = statusConfig[workload.status];
            return (
              <div key={workload.member.id} className={cn(
                "relative flex flex-col gap-7 p-7 rounded-2xl bg-white/[0.01] ring-1 ring-white/[0.03] transition-all duration-500 group/operator",
                revokeMode && workload.member.id !== user?.id && workload.member.role !== "OWNER"
                  ? "ring-orbit-red/20 hover:ring-orbit-red/40" 
                  : "hover:bg-white/[0.025] hover:ring-white/[0.05] hover:-translate-y-[1px]"
              )}>
                {revokeMode && workload.member.id !== user?.id && workload.member.role !== "OWNER" && (
                  <button
                    onClick={() => setMemberToRemove(workload.member.id)}
                    className="absolute top-3 right-3 p-1.5 rounded-full bg-orbit-red/10 text-orbit-red hover:bg-orbit-red/20 transition-colors z-10"
                    aria-label={`Remove ${workload.member.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Operator Identity */}
                <div className="flex items-center gap-3.5">
                  <UserAvatar
                    photoURL={workload.member.photoURL}
                    name={workload.member.name}
                    size="md"
                    className="ring-1 ring-white/[0.05]"
                  />
                  <div className="min-w-0">
                    <span className="text-[14px] font-medium text-[#e0e0e0] leading-tight block tracking-tight truncate group-hover/operator:text-white transition-colors duration-300">
                      {workload.member.name}
                    </span>
                    <span className={cn("text-[9px] font-mono uppercase tracking-[0.2em] mt-1 block leading-none transition-all duration-500", config.color)}>
                      {config.label}
                    </span>
                  </div>
                </div>

                {/* Pressure Bar */}
                <div className="space-y-2">
                  <div className="h-[2px] w-full bg-white/[0.03] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full pressure-fill"
                      style={{ width: config.barWidth, backgroundColor: config.barColor }}
                    />
                  </div>
                </div>

                {/* Metric Grid */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xl font-extralight text-[#ededed] tabular-nums leading-none">
                      {workload.metrics.activeTasks.toString().padStart(2, '0')}
                    </span>
                    <span className="text-[9px] text-[#3a3a3a] uppercase tracking-[0.15em] font-mono">Active</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={cn("text-xl font-extralight tabular-nums leading-none", workload.metrics.overdueTasks > 0 ? "text-orbit-red" : "text-[#ededed]/25")}>
                      {workload.metrics.overdueTasks.toString().padStart(2, '0')}
                    </span>
                    <span className="text-[9px] text-[#3a3a3a] uppercase tracking-[0.15em] font-mono">Overdue</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={cn("text-xl font-extralight tabular-nums leading-none", workload.metrics.completedThisWeek > 0 ? "text-orbit-green" : "text-[#ededed]/25")}>
                      {workload.metrics.completedThisWeek.toString().padStart(2, '0')}
                    </span>
                    <span className="text-[9px] text-[#3a3a3a] uppercase tracking-[0.15em] font-mono">Wins</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DestructiveActionModal
        isOpen={!!memberToRemove}
        onClose={() => setMemberToRemove(null)}
        onConfirm={handleRemove}
        title="Revoke Node Access"
        entityName={memberWorkloads.find(w => w.member.id === memberToRemove)?.member.name || ""}
        description="You are about to revoke system access for this operator. All active task vectors will be decoupled."
        warningMessage="This execution will trigger an immediate session termination for the target node. All metadata and configuration associated with this node's operational state will be archived but inaccessible."
        actionLabel="Confirm Revocation"
        isLoading={isRemoving}
      />
    </div>
  );
}
