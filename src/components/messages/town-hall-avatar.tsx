"use client";

import Image from "next/image";
import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Town Hall's face                                                   */
/*                                                                     */
/*  The company's picture once an owner has set one, the megaphone     */
/*  until then. One component so the rail, the header, the forward    */
/*  picker and every company post draw the same thing.                 */
/* ------------------------------------------------------------------ */

const SIZE = {
  sm: { box: "h-8 w-8 rounded-[10px]", icon: "h-3.5 w-3.5" },
  lg: { box: "h-12 w-12 rounded-xl", icon: "h-4 w-4" },
  xl: { box: "h-20 w-20 rounded-2xl", icon: "h-6 w-6" },
} as const;

export function TownHallAvatar({
  photoURL,
  name,
  size = "sm",
  className,
}: {
  photoURL?: string | null;
  name: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden ring-1",
        SIZE[size].box,
        photoURL
          ? "bg-surface-control ring-line/[0.06]"
          : "bg-orbit-amber/10 ring-orbit-amber/20",
        className
      )}
    >
      {photoURL ? (
        <Image src={photoURL} alt={name} fill sizes="80px" className="object-cover" />
      ) : (
        <Megaphone className={cn(SIZE[size].icon, "text-orbit-amber")} aria-hidden />
      )}
    </span>
  );
}
