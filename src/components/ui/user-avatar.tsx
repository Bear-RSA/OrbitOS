"use client";

import { RANK_HALO } from "@/components/ui/rank-styles";
import { useIsInternalManagement } from "@/hooks/use-internal-management-badges";
import type { Rank } from "@/lib/members/rank";
import { cn } from "@/lib/utils/classnames";
import Image from "next/image";

interface UserAvatarProps {
  photoURL?: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  /** Draws the rank's halo: gold for an Owner, down to none for a Member. */
  rank?: Rank;
  /**
   * Whose avatar this is. With it, someone in Internal Management gets the
   * IM chip, drawn only for viewers who are in Internal Management too.
   */
  uid?: string;
}

const IM_CHIP_SIZE = {
  sm: "px-[3px] text-[7px] leading-[11px]",
  md: "px-[3px] text-[8px] leading-[12px]",
  lg: "px-1 text-[9px] leading-[13px]",
  xl: "px-1.5 text-[11px] leading-[16px]",
  "2xl": "px-2 text-[13px] leading-[20px]",
};

export function UserAvatar({ photoURL, name, size = "md", className, rank, uid }: UserAvatarProps) {
  const internalManagement = useIsInternalManagement(uid);
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);

  const sizeMap = {
    sm: "w-8 h-8 rounded-lg text-[11px]",
    md: "w-10 h-10 rounded-xl text-[13px]",
    lg: "w-12 h-12 rounded-xl text-[15px]",
    xl: "w-20 h-20 rounded-2xl text-[24px]",
    "2xl": "w-32 h-32 rounded-3xl text-[36px]",
  };

  const innerRadiusMap = {
    sm: "rounded-[6px]",
    md: "rounded-[10px]",
    lg: "rounded-[10px]",
    xl: "rounded-[14px]",
    "2xl": "rounded-[20px]",
  };

  return (
    <div className={cn(
      "relative flex-shrink-0 group overflow-hidden bg-surface-sunken p-[1px] shadow-card ring-1 ring-line/[0.04]",
      sizeMap[size],
      rank && RANK_HALO[rank],
      className
    )}>
      <div className={cn(
        "w-full h-full bg-surface-control flex items-center justify-center overflow-hidden relative",
        innerRadiusMap[size]
      )}>
        {photoURL ? (
          <Image
            src={photoURL}
            alt={name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <span className="font-light text-ink tracking-tight">
            {initials}
          </span>
        )}
        {internalManagement && (
          <span
            title="Internal Management"
            aria-label="Internal Management"
            className={cn(
              "absolute bottom-0 left-0 z-10 rounded-tr-[5px] bg-ink font-mono font-medium tracking-tight text-on-ink",
              IM_CHIP_SIZE[size]
            )}
          >
            IM
          </span>
        )}
      </div>
    </div>
  );
}
