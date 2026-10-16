"use client";

import { Settings2 } from "lucide-react";

import { UserAvatar } from "@/components/ui/user-avatar";
import { memberDisplayName } from "@/lib/members/profile";
import type { Rank } from "@/lib/members/rank";
import { presenceLabel, presenceTone, type Presence } from "@/lib/members/presence";
import { cn } from "@/lib/utils/classnames";
import type { Member } from "@/types/member";

/* ------------------------------------------------------------------ */
/*  The pieces every node in the tree shares                           */
/* ------------------------------------------------------------------ */

/** What each card needs to know about the viewer and what it may do. */
export interface TreeNodeContext {
  viewerId: string;
  /** Whether they are online right now, from the heartbeat. */
  presenceOf: (uid: string) => Presence | undefined;
  /** The rank whose halo this person's avatar wears. */
  rankOf: (member: Member) => Rank;
  onOpenProfile: (uid: string) => void;
  onManage: (uid: string) => void;
}

const AVATAR = {
  owner: { size: "lg" as const, className: "h-14 w-14 rounded-2xl" },
  lead: { size: "md" as const, className: "" },
  member: { size: "sm" as const, className: "" },
};

const DOT = {
  owner: "h-3.5 w-3.5 border-[3px]",
  lead: "h-3 w-3 border-[2.5px]",
  member: "h-2.5 w-2.5 border-2",
};

/** Avatar with the online/offline dot over its bottom-right corner. */
export function TreeAvatar({
  member,
  tier,
  status,
  rank,
}: {
  member: Member;
  tier: keyof typeof AVATAR;
  status: Presence | undefined;
  rank?: Rank;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <UserAvatar
        photoURL={member.photoURL}
        name={memberDisplayName(member)}
        size={AVATAR[tier].size}
        className={AVATAR[tier].className}
        rank={rank}
      />
      {status && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full border-base",
            DOT[tier],
            presenceTone(status)
          )}
          title={presenceLabel(status)}
          role="img"
          aria-label={presenceLabel(status)}
        />
      )}
    </span>
  );
}

/** Uppercase caption: `Lead`, `Main owner`, `Owner`. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("text-[11px] uppercase tracking-wide text-ink-faint", className)}>{children}</span>
  );
}

/** Zero-padded count in the page's numeric pill. */
export function CountPill({ value, label }: { value: number; label: string }) {
  return (
    <span
      className="shrink-0 rounded-full bg-surface-control px-2.5 py-0.5 font-mono text-[11px] text-ink-muted tabular-nums"
      aria-label={label}
    >
      {value.toString().padStart(2, "0")}
    </span>
  );
}

export function ManageButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Manage ${name}`}
      className="relative z-10 shrink-0 rounded-lg p-2 text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <Settings2 className="h-3.5 w-3.5" />
    </button>
  );
}

/** One person on a row: avatar, name and caption, opening their profile. */
export function PersonRow({
  member,
  tier,
  caption,
  context,
  manageable,
  muted = false,
}: {
  member: Member;
  tier: "lead" | "member";
  caption?: string;
  context: TreeNodeContext;
  manageable: boolean;
  muted?: boolean;
}) {
  const name = memberDisplayName(member);
  const isSelf = member.id === context.viewerId;

  return (
    <div className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={() => context.onOpenProfile(member.id)}
        aria-label={`View ${name}'s profile`}
        className="relative z-10 flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left transition-colors hover:bg-surface-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <TreeAvatar
          member={member}
          tier={tier}
          status={context.presenceOf(member.id)}
          rank={context.rankOf(member)}
        />
        <span className="min-w-0">
          <span
            className={cn(
              "block truncate font-light",
              tier === "lead" ? "text-[15px]" : "text-[13px]",
              muted ? "text-ink-dim" : "text-ink"
            )}
          >
            {name}
            {isSelf && <span className="text-ink-dim"> · You</span>}
          </span>
          {(caption || member.roleDescriptor) && (
            <span className="block truncate text-[12px] text-ink-dim">
              {caption ?? member.roleDescriptor}
            </span>
          )}
        </span>
      </button>
      {manageable && <ManageButton name={name} onClick={() => context.onManage(member.id)} />}
    </div>
  );
}
