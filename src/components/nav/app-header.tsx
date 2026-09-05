"use client";

import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";
import { AppNav } from "@/components/nav/app-nav";
import { ProfileLink } from "@/components/nav/profile-link";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  App Header                                                         */
/*                                                                     */
/*  Every page used to hand-roll its own bar, so the chrome drifted:   */
/*  Teams carried a 10px logo at 17px type with no fixed bar height,   */
/*  everyone else 9px at 15px, and the gap below the bar ranged from   */
/*  mb-10 to mb-24. One component now owns all of that; a page         */
/*  contributes only the controls that are actually its own.           */
/* ------------------------------------------------------------------ */

/**
 * The logo already goes home and the gear on /profile already goes to
 * settings, so neither earns a slot in the nav. Every page currently
 * agrees; pass `hide` explicitly (or `[]`) to opt out.
 */
const DEFAULT_HIDE = ["/dashboard", "/settings"];

interface AppHeaderUser {
  id?: string;
  orgId?: string;
  photoURL?: string | null;
  name?: string | null;
}

interface AppHeaderProps {
  user: AppHeaderUser;
  /** Nav destinations to leave out on this page. Defaults to DEFAULT_HIDE. */
  hide?: string[];
  /** Page-specific controls, seated to the left of the avatar. */
  actions?: ReactNode;
  /**
   * "shell" bleeds past DashboardShell's padding and sticks on scroll.
   * "flush" suits a page that already owns its own full-height column.
   */
  variant?: "shell" | "flush";
  className?: string;
}

export function AppHeader({
  user,
  hide = DEFAULT_HIDE,
  actions,
  variant = "shell",
  className,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "bg-base/80 px-5 backdrop-blur-xl sm:px-8 lg:px-10",
        variant === "shell"
          ? "sticky top-0 z-40 -mx-5 mb-12 sm:-mx-8 lg:-mx-10"
          : "shrink-0",
        className
      )}
    >
      {/* Three tracks so the nav sits on the page's centre line rather
          than wherever the two side clusters happen to leave it. */}
      <div
        className={cn(
          "grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4 tracking-tight",
          variant === "flush" && "mx-auto w-full max-w-6xl"
        )}
      >
        <Link
          href="/dashboard"
          aria-label="OrbitOS home"
          className="group flex min-w-0 items-center gap-3.5 justify-self-start rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
        >
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[10px] bg-surface-control shadow-raised">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-sheen/[0.04] to-transparent opacity-0 transition-opacity group-hover:opacity-100"
            />
            <Image src="/logo.png" alt="" fill className="z-10 rounded-[inherit] object-cover" />
          </div>
          {/* The wordmark yields to the nav on small screens. */}
          <span className="hidden text-[15px] font-medium tracking-tight text-ink transition-colors group-hover:text-ink-strong md:inline">
            OrbitOS
          </span>
        </Link>

        <AppNav uid={user.id} orgId={user.orgId} hide={hide} />

        <div className="flex shrink-0 items-center justify-end gap-2">
          {actions}
          <ProfileLink photoURL={user.photoURL} name={user.name} className="ml-1" />
        </div>
      </div>
    </header>
  );
}
