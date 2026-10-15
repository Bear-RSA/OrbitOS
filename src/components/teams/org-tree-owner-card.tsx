"use client";

import { Crown } from "lucide-react";

import { InteractiveCard } from "@/components/ui/interactive-card";
import { memberDisplayName } from "@/lib/members/profile";
import type { Member } from "@/types/member";

import { Eyebrow, ManageButton, TreeAvatar, type TreeNodeContext } from "./org-tree-person";

/* ------------------------------------------------------------------ */
/*  Owner card                                                         */
/*                                                                     */
/*  Every owner gets the same gold card, side by side in one row: to   */
/*  the workspace they are equals. Only the account holder's own card  */
/*  says "Account holder", and only on their screen, because nobody    */
/*  else is ever told which owner that is.                             */
/* ------------------------------------------------------------------ */

/** Matches `w-[300px]` below; the tree lays out by it. */
export const OWNER_CARD_WIDTH = 300;

export function OrgTreeOwnerCard({
  member,
  isAccountHolder,
  context,
  manageable,
}: {
  member: Member;
  /** True only on the account holder's own screen, for their own card. */
  isAccountHolder: boolean;
  context: TreeNodeContext;
  manageable: boolean;
}) {
  const name = memberDisplayName(member);
  const isSelf = member.id === context.viewerId;

  return (
    <InteractiveCard surface="fog" className="w-[300px] p-6 ring-orbit-gold/35">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => context.onOpenProfile(member.id)}
          aria-label={`View ${name}'s profile`}
          className="relative z-10 flex min-w-0 flex-1 items-center gap-4 rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <TreeAvatar member={member} tier="owner" status={context.statusOf(member.id)} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <Crown className="h-3 w-3 shrink-0 text-orbit-gold" aria-hidden />
              <Eyebrow className="text-orbit-gold">{isAccountHolder ? "Account holder" : "Owner"}</Eyebrow>
            </span>
            <span className="mt-1 block truncate text-xl font-light tracking-tight text-ink">{name}</span>
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
