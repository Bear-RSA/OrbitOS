"use client";

import Link from "next/link";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Profile Link                                                       */
/*                                                                     */
/*  The avatar in the top-right corner is the same control on every    */
/*  page, so it is one component rather than five hand-copied buttons  */
/*  that could drift apart.                                            */
/* ------------------------------------------------------------------ */

interface ProfileLinkProps {
  photoURL?: string | null;
  name?: string | null;
  className?: string;
}

export function ProfileLink({ photoURL, name, className }: ProfileLinkProps) {
  return (
    <Link
      href="/profile"
      aria-label="Open your profile"
      title="Profile"
      className={cn(
        "rounded-full transition-transform duration-300 hover:-translate-y-[2px]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base",
        className
      )}
    >
      <UserAvatar photoURL={photoURL} name={name ?? ""} size="md" />
    </Link>
  );
}
