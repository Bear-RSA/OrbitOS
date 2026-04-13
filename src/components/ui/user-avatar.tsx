"use client";

import { cn } from "@/lib/utils/classnames";
import Image from "next/image";

interface UserAvatarProps {
  photoURL?: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
}

export function UserAvatar({ photoURL, name, size = "md", className }: UserAvatarProps) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);

  const sizeMap = {
    sm: "w-8 h-8 rounded-lg text-[10px]",
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
      "relative flex-shrink-0 group overflow-hidden bg-[#0A0A0A] p-[1px] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ring-1 ring-white/[0.04]",
      sizeMap[size],
      className
    )}>
      <div className={cn(
        "w-full h-full bg-[#111111] flex items-center justify-center overflow-hidden relative",
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
          <span className="font-light text-[#ededed] tracking-tight">
            {initials}
          </span>
        )}
      </div>
    </div>
  );
}
