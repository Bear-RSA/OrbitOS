"use client";

import { useState } from "react";
import { Users, UserPlus, UserMinus, X } from "lucide-react";
import { MemberWorkload } from "@/types/dashboard";
import { cn } from "@/lib/utils/classnames";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/contexts/auth-context";
import { DestructiveActionModal } from "@/components/ui/destructive-action-modal";
import { removeMemberAction } from "@/app/actions/members/removeMemberAction";
import { DashboardCard, CardHeader, ActionButton } from "./dashboard-card";
import { themeColor } from "@/lib/theme/colors";

interface TeamWorkloadCardProps {
  memberWorkloads: MemberWorkload[];
  /**
   * Owner-only. Members are shown the same grid without it — and the card
   * suppresses the control anyway if it is ever handed to a non-owner.
   */
  onInviteClick?: () => void;
}

const statusConfig = {
  // Lightened from #5D6D7E — that failed contrast at 3.8:1 on the card surface.
  light: { label: "Under Capacity", color: "text-orbit-blue", ringAccent: "ring-orbit-blue/10", barColor: themeColor.blue, barWidth: "25%" },
  balanced: { label: "Optimal Flow", color: "text-orbit-green", ringAccent: "ring-orbit-green/10", barColor: themeColor.green, barWidth: "50%" },
  heavy: { label: "High Volume", color: "text-orbit-amber", ringAccent: "ring-orbit-amber/10", barColor: themeColor.amber, barWidth: "75%" },
  "needs-attention": { label: "Critical Load", color: "text-orbit-red", ringAccent: "ring-orbit-red/12", barColor: themeColor.red, barWidth: "95%" },
};

export function TeamWorkloadCard({ memberWorkloads, onInviteClick }: TeamWorkloadCardProps) {
  const { user } = useAuth();
  const [revokeMode, setRevokeMode] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);

  /* The grid is visible to everyone in the org; only the owner gets the
     seat controls. Both server actions behind them re-check the role, so
     this is presentation, not the security boundary. */
  const currentUserWorkload = memberWorkloads.find(w => w.member.id === user?.id);
  const isOwner = currentUserWorkload?.member.role === "OWNER";

  const handleRemove = async (): Promise<{ success: boolean; error?: string }> => {
    if (!memberToRemove || !user?.id) {
      return { success: false, error: "Missing target or session. Re-authenticate and retry." };
    }

    // Client-side OWNER gate — the server action also enforces this
    if (!isOwner) {
      return { success: false, error: "Unauthorized. Only the Root Owner can revoke node access." };
    }

    try {
      const result = await removeMemberAction({
        targetUserId: memberToRemove,
        uid: user.id,
      });

      if (result.success) {
        setMemberToRemove(null);
        const remainingRemovable = memberWorkloads.filter(w => w.member.id !== memberToRemove && w.member.role !== "OWNER" && w.member.id !== user?.id).length;
        if (remainingRemovable === 0) {
          setRevokeMode(false);
        }
      }

      // Always return the result to the modal so it can display errors inline
      return result;
    } catch (err: any) {
      const message = err?.message || "An unexpected error occurred during revocation.";
      console.error("[Revoke Node Access]:", message);
      return { success: false, error: message };
    }
  };

  return (
    <DashboardCard interactive={false} tone="quiet">
      <CardHeader
        title="Operational Load Grid"
        icon={Users}
        action={
          <div className="flex shrink-0 items-center gap-2">
            {isOwner && onInviteClick && (
              <ActionButton icon={UserPlus} label="Invite Node" collapsed onClick={onInviteClick} />
            )}
            {isOwner && memberWorkloads.length > 1 && (
              <ActionButton
                icon={UserMinus}
                label={revokeMode ? "Done" : "Revoke"}
                collapsed
                variant={revokeMode ? "danger" : "ghost"}
                onClick={() => setRevokeMode(!revokeMode)}
              />
            )}
          </div>
        }
      />

      {memberWorkloads.length === 0 ? (
        <div className="space-y-2 py-4">
          <p className="text-[15px] font-medium text-ink">Node network inactive.</p>
          <p className="text-[13px] font-light leading-relaxed text-ink-muted">Operational load metrics require primary operator assignment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {memberWorkloads.map((workload) => {
            const config = statusConfig[workload.status];
            const removable = revokeMode && workload.member.id !== user?.id && workload.member.role !== "OWNER";
            return (
              <div key={workload.member.id} className={cn(
                "group/operator relative flex flex-col gap-5 rounded-2xl bg-surface-card p-5 ring-1 ring-inset ring-line/[0.06] transition-all duration-500",
                removable
                  ? "ring-orbit-red/25 hover:ring-orbit-red/45"
                  : "hover:-translate-y-[1px] hover:bg-surface-raised hover:ring-line/[0.1]"
              )}>
                {removable && (
                  <button
                    onClick={() => setMemberToRemove(workload.member.id)}
                    className="absolute right-3 top-3 z-10 rounded-full bg-orbit-red/12 p-1.5 text-orbit-red transition-colors hover:bg-orbit-red/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-red/50"
                    aria-label={`Remove ${workload.member.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Operator Identity */}
                <div className="flex items-center gap-3">
                  <UserAvatar
                    photoURL={workload.member.photoURL}
                    name={workload.member.name}
                    size="md"
                    className="shrink-0 ring-1 ring-line/[0.08]"
                  />
                  <div className="min-w-0">
                    <span className="block truncate text-[14px] font-medium leading-tight tracking-tight text-ink transition-colors duration-300 group-hover/operator:text-ink-strong">
                      {workload.member.name}
                    </span>
                    <span className={cn("mt-1.5 block font-mono text-[9px] uppercase leading-none tracking-[0.16em] transition-all duration-500", config.color)}>
                      {config.label}
                    </span>
                  </div>
                </div>

                {/* Pressure Bar */}
                <div className="h-1 w-full overflow-hidden rounded-full bg-surface-hover">
                  <div
                    className="pressure-fill h-full rounded-full"
                    style={{ width: config.barWidth, backgroundColor: config.barColor }}
                  />
                </div>

                {/* Metric Grid */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Active", value: workload.metrics.activeTasks, tone: "text-ink" },
                    { label: "Overdue", value: workload.metrics.overdueTasks, tone: workload.metrics.overdueTasks > 0 ? "text-orbit-red" : "text-ink-dim" },
                    { label: "Wins", value: workload.metrics.completedThisWeek, tone: workload.metrics.completedThisWeek > 0 ? "text-orbit-green" : "text-ink-dim" },
                  ].map((m) => (
                    <div key={m.label} className="flex flex-col gap-1.5">
                      <span className={cn("text-xl font-extralight leading-none tabular-nums", m.tone)}>
                        {m.value.toString().padStart(2, '0')}
                      </span>
                      <span className="font-mono text-[9px] uppercase leading-none tracking-[0.14em] text-ink-dim">{m.label}</span>
                    </div>
                  ))}
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
      />
    </DashboardCard>
  );
}
