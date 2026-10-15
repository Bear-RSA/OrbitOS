"use client";

import Link from "next/link";
import { useRef } from "react";
import { OrbitLockup } from "@/components/marketing/brand";
import { useHideOnScroll } from "@/hooks/use-hide-on-scroll";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useScrolledPast } from "@/hooks/use-scrolled-past";
import { cn } from "@/lib/utils/classnames";
import { GlassSurface } from "@/components/ui/glass-surface";

/**
 * The single top bar for every marketing page.
 *
 * Previously each page inlined its own copy, and they had already drifted:
 * the landing page used <Logo> while the other six hand-rolled a
 * `div + next/image` block, and the wordmark linked home on some pages but
 * not others. One component, one active-state treatment.
 *
 * It is a floating glass capsule the page scrolls under, the same shape
 * as the app header. It lifts with a shadow once content is actually
 * passing beneath it. Like the app header it leaves on scroll down and
 * returns on any scroll up; the motion is `.chrome-bar` in globals.css.
 */

type NavKey = "features" | "methodology" | "pricing" | "changelog";

const LINKS: { key: NavKey; label: string; href: string }[] = [
  { key: "features", label: "Features", href: "/#features" },
  { key: "methodology", label: "Methodology", href: "/methodology" },
  { key: "pricing", label: "Pricing", href: "/pricing" },
  { key: "changelog", label: "Changelog", href: "/changelog" },
];

const PRESS =
  "transition-[transform,color,background-color,box-shadow] duration-quick ease-spring active:scale-[0.96] active:duration-press active:ease-press [-webkit-tap-highlight-color:transparent]";

export function MarketingNav({ active }: { active?: NavKey }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrolled = useScrolledPast(sentinelRef);
  const reducedMotion = useReducedMotion();
  const hidden = useHideOnScroll(!reducedMotion);

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="absolute left-0 top-0 h-px w-px" />
      {/* The strip only positions the capsule; it lets clicks through to
          the page on either side of it. */}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 px-4 md:px-6">
        <GlassSurface
          role="navigation"
          weight="chrome"
          tint="base"
          fallback="material-chrome"
          data-scrolled={scrolled ? "true" : undefined}
          data-hidden={hidden ? "true" : undefined}
          className={cn(
            /* Half the height, not `rounded-full`: the glass engine reads the
               computed radius in px and 9999px is no shape. */
            "pointer-events-auto relative mx-auto h-14 max-w-7xl rounded-[28px] ring-1 ring-inset ring-line/[0.08]",
            "chrome-bar",
            scrolled && "shadow-raised"
          )}
        >
          <div className="flex h-14 items-center justify-between pl-5 pr-2">
            {/* Wrapped so the reveal can fade it without overriding the
                press transition the link already carries. */}
            <div data-chrome-part="side">
              <Link
                href="/"
                aria-label="OrbitOS home"
                className={cn("rounded-lg", PRESS)}
              >
                <OrbitLockup />
              </Link>
            </div>

            <div data-chrome-part="centre" className="hidden items-center gap-8 md:flex">
              {LINKS.map(({ key, label, href }) => (
                <Link
                  key={key}
                  href={href}
                  aria-current={active === key ? "page" : undefined}
                  className={cn(
                    "relative font-sans tracking-tight transition-colors duration-quick ease-spring",
                    "after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:origin-left after:bg-ink after:transition-transform after:duration-quick after:ease-spring",
                    active === key
                      ? "vibrant after:scale-x-100"
                      : "font-light text-ink-muted hover:text-ink after:scale-x-0"
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>

            <div data-chrome-part="side" className="flex items-center gap-4 sm:gap-6">
              <Link
                href="/login"
                className={cn("rounded-lg font-sans text-sm font-medium text-ink-muted hover:text-ink", PRESS)}
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className={cn(
                  "rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-on-ink hover:bg-white hover:shadow-[0_0_24px_rgba(255,255,255,0.12)]",
                  PRESS
                )}
              >
                Get Started
              </Link>
            </div>
          </div>
        </GlassSurface>
      </div>
    </>
  );
}
