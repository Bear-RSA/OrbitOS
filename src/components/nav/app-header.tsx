"use client";

import Link from "next/link";
import { ReactNode, useRef } from "react";
import { OrbitMark } from "@/components/brand/orbit-mark";
import { AppNav } from "@/components/nav/app-nav";
import { ProfileLink } from "@/components/nav/profile-link";
import { useHideOnScroll } from "@/hooks/use-hide-on-scroll";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useScrolledPast } from "@/hooks/use-scrolled-past";
import { cn } from "@/lib/utils/classnames";
import { GlassSurface } from "@/components/ui/glass-surface";

/* ------------------------------------------------------------------ */
/*  App Header                                                         */
/*                                                                     */
/*  Every page used to hand-roll its own bar, so the chrome drifted:   */
/*  Teams carried a 10px logo at 17px type with no fixed bar height,   */
/*  everyone else 9px at 15px, and the gap below the bar ranged from   */
/*  mb-10 to mb-24. One component now owns all of that; a page         */
/*  contributes only the controls that are actually its own.           */
/*                                                                     */
/*  The bar is a floating capsule, not a strip: translucent glass      */
/*  inset from the page edges, with content scrolling under it. It     */
/*  lifts with a shadow only once something has actually scrolled      */
/*  underneath — at the top of the page it sits flat on the page.      */
/*                                                                     */
/*  Scrolling down sends it away; any scroll up brings it straight     */
/*  back. The contents dissolve first, then the empty glass lifts off  */
/*  the top edge. On return the capsule drops in on the bounce spring  */
/*  and its contents resolve after it, centre out. The choreography    */
/*  lives with the other motion in globals.css (`.chrome-bar`).        */
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
  // Reduced motion keeps the bar pinned: a capsule that blinks in and out
  // of existence with no travel is worse than one that simply stays.
  const reducedMotion = useReducedMotion();
  const hidden = useHideOnScroll(sticky && !reducedMotion);

  const bar = (
    <GlassSurface
      role="banner"
      weight="chrome"
      tint="base"
      fallback="material-chrome"
      data-scrolled={sticky && scrolled ? "true" : undefined}
      data-hidden={hidden ? "true" : undefined}
      className={cn(
        /* A fixed radius of half the height, not `rounded-full`: the glass
           engine reads the computed radius in px and 9999px is no shape. */
        "relative h-14 rounded-[28px] px-2 ring-1 ring-inset ring-line/[0.08]",
        sticky ? "chrome-bar" : "transition-shadow duration-quick ease-spring",
        sticky && scrolled && "shadow-raised",
        sticky ? "sticky top-3 z-40 mb-12 mt-3" : "",
        className
      )}
    >
      {/* Three tracks so the nav sits on the page's centre line rather
          than wherever the two side clusters happen to leave it. */}
      <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-4 tracking-tight">
        {/* Each grid cell is wrapped so the reveal can fade it without
            touching the transitions its own controls already carry. */}
        <div data-chrome-part="side" className="justify-self-start">
          <Link
            href="/dashboard"
            aria-label="OrbitOS home"
            className={cn(
              /* No `min-w-0`: it let this grid track collapse to nothing on
                   a phone, and the nav — which grows to fill whatever it is
                   given — then started under the logo. Holding the logo's
                   width makes the nav the track that gives way, and it
                   scrolls. */
              "group flex shrink-0 items-center gap-3.5 justify-self-start rounded-full",
              "transition-transform duration-quick ease-spring active:scale-[0.97] active:duration-press active:ease-press",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
            )}
          >
            {/* A circle the avatar's size, so both ends of the pill sit 8px
                  inside its curve. */}
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-control shadow-raised">
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
        </div>

        <div data-chrome-part="centre" className="min-w-0">
          <AppNav uid={user.id} orgId={user.orgId} hide={hide} />
        </div>

        <div data-chrome-part="side" className="flex shrink-0 items-center justify-end gap-2">
          {actions}
          <ProfileLink photoURL={user.photoURL} name={user.name} className="ml-1" />
        </div>
      </div>
    </GlassSurface>
  );

  if (!sticky) {
    // Matches the page's own column so the capsule lines up with it.
    return <div className="mx-auto w-full max-w-6xl shrink-0 px-5 pt-3 sm:px-8 lg:px-10">{bar}</div>;
  }

  return (
    <>
      {/* Zero-height marker just above the bar. When it leaves the
          viewport, the bar is stuck and content is under it. */}
      <div ref={sentinelRef} aria-hidden className="h-px w-px -mb-px" />
      {bar}
    </>
  );
}
