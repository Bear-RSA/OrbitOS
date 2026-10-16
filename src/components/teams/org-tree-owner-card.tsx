"use client";

import { Award, Crown } from "lucide-react";

import { InteractiveCard } from "@/components/ui/interactive-card";
import { memberDisplayName } from "@/lib/members/profile";
import { cn } from "@/lib/utils/classnames";
import type { Member } from "@/types/member";

import { Eyebrow, ManageButton, TreeAvatar, type TreeNodeContext } from "./org-tree-person";

/* ------------------------------------------------------------------ */
/*  Owner and Executive cards                                          */
/*                                                                     */
/*  Every owner gets the same gold card, side by side in one row: to   */
/*  the workspace they are equals. Executives get the same card in     */
/*  violet, a size down, in the row beneath their Owner. An owner in   */
/*  Internal Management sees it on their own card, on their own screen */
/*  only: nobody else is told who is in it.                            */
/* ------------------------------------------------------------------ */

/** Matches `sm:w-[300px]` below; the desktop tree lays out by it. */
export const OWNER_CARD_WIDTH = 300;
/** Matches `sm:w-[260px]` below. */
export const EXECUTIVE_CARD_WIDTH = 260;

export function OrgTreeOwnerCard({
  member,
  rank = "OWNER",
  inInternalManagement,
  context,
  manageable,
}: {
  member: Member;
  rank?: "OWNER" | "EXECUTIVE";
  /** True only on the viewer's own card, when they are in Internal Management. */
  inInternalManagement: boolean;
  context: TreeNodeContext;
  manageable: boolean;
}) {
  const name = memberDisplayName(member);
  const isSelf = member.id === context.viewerId;
  const owner = rank === "OWNER";
  const Icon = owner ? Crown : Award;
  const label = owner ? "Owner" : "Executive";

  return (
    <InteractiveCard
      surface="fog"
      className={cn(
        "w-full",
        owner ? "p-6 ring-orbit-gold/35 sm:w-[300px]" : "p-5 ring-orbit-violet/35 sm:w-[260px]"
      )}
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => context.onOpenProfile(member.id)}
          aria-label={`View ${name}'s profile`}
          className="relative z-10 flex min-w-0 flex-1 items-center gap-4 rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <TreeAvatar
            member={member}
            tier={owner ? "owner" : "lead"}
            status={context.statusOf(member.id)}
            rank={rank}
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <Icon className={cn("h-3 w-3 shrink-0", owner ? "text-orbit-gold" : "text-orbit-violet")} aria-hidden />
              <Eyebrow className={owner ? "text-orbit-gold" : "text-orbit-violet"}>
                {inInternalManagement ? `${label} · Internal Management` : label}
              </Eyebrow>
            </span>
            <span
              className={cn(
                "mt-1 block truncate font-light tracking-tight text-ink",
                owner ? "text-xl" : "text-[17px]"
              )}
            >
              {name}
            </span>
            {(member.roleDescriptor || isSelf) && (
              <span className="block truncate text-[12px] text-ink-dim">
                {[member.roleDescriptor, isSelf && "You"].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
        </button>
        {manageable && <ManageButton name={name} onClick={() => context.onManage(member.id)} />}
      </div>
    </InteractiveCard>
  );
}
