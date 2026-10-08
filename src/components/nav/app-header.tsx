"use client";

import Link from "next/link";
import { ReactNode, useRef } from "react";
import { OrbitMark } from "@/components/brand/orbit-mark";
import { AppNav } from "@/components/nav/app-nav";
import { ProfileLink } from "@/components/nav/profile-link";
import { useScrolledPast } from "@/hooks/use-scrolled-past";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  App Header                                                         */
/*                                                                     */
/*  Every page used to hand-roll its own bar, so the chrome drifted:   */
/*  Teams carried a 10px logo at 17px type with no fixed bar height,   */
/*  everyone else 9px at 15px, and the gap below the bar ranged from   */
/*  mb-10 to mb-24. One component now owns all of that; a page         */
/*  contributes only the controls that are actually its own.           */
/*                                                                     */
/*  The bar is a material, not a strip: translucent, with content      */
/*  scrolling under it. Where the two meet there is a short fade       */
/*  instead of a rule, and only once something has actually scrolled   */
/*  underneath — at the top of the page the bar and the page are one.  */
/* ------------------------------------------------------------------ */

/**
 * Settings is reachable from the avatar, so it does not earn a nav slot.
 * Dashboard stays: the logo also goes there, but nobody should have to
 * know that to find home. Pass `hide` explicitly (or `[]`) to opt out.
 */
const DEFAULT_HIDE = ["/settings"];

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

export function AppHeader({ user, hide = DEFAULT_HIDE, actions, variant = "shell", className }: AppHeaderProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrolled = useScrolledPast(sentinelRef);
  const sticky = variant === "shell";

  return (
    <>
      {/* Zero-height marker just above the bar. When it leaves the
          viewport, the bar is stuck and content is under it. */}
      {sticky && <div ref={sentinelRef} aria-hidden className="h-px w-px -mb-px" />}
      <header
        data-scrolled={sticky && scrolled ? "true" : undefined}
        className={cn(
          "material-chrome scroll-edge relative px-5 sm:px-8 lg:px-10",
          sticky ? "sticky top-0 z-40 -mx-5 mb-12 sm:-mx-8 lg:-mx-10" : "shrink-0",
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
            className={cn(
              "group flex min-w-0 items-center gap-3.5 justify-self-start rounded-lg",
              "transition-transform duration-quick ease-spring active:scale-[0.97] active:duration-press active:ease-press",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
            )}
          >
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[10px] bg-surface-control shadow-raised">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-sheen/[0.04] to-transparent opacity-0 transition-opacity group-hover:opacity-100"
              />
              <div className="relative z-10 flex h-full w-full items-center justify-center">
                <OrbitMark className="h-[64%] w-[64%] text-ink-strong" />
              </div>
            </div>
            {/* The wordmark yields to the nav on small screens. */}
            <span className="vibrant hidden text-[15px] tracking-tight transition-colors group-hover:text-ink-strong md:inline">
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
    </>
  );
}
