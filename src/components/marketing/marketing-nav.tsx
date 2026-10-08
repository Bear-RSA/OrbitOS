"use client";

import Link from "next/link";
import { useRef } from "react";
import { Logo } from "@/components/brand/logo";
import { useScrolledPast } from "@/hooks/use-scrolled-past";
import { cn } from "@/lib/utils/classnames";

/**
 * The single top bar for every marketing page.
 *
 * Previously each page inlined its own copy, and they had already drifted:
 * the landing page used <Logo> while the other six hand-rolled a
 * `div + next/image` block, and the wordmark linked home on some pages but
 * not others. One component, one active-state treatment.
 *
 * It is a translucent material the page scrolls under. The hairline rule
 * it used to carry is gone; a short fade appears at its lower edge once
 * content is actually passing beneath it.
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

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="absolute left-0 top-0 h-px w-px" />
      <nav
        data-scrolled={scrolled ? "true" : undefined}
        className="material-chrome scroll-edge fixed top-0 z-50 w-full"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 md:px-8">
          <Link
            href="/"
            className={cn("flex items-center gap-3 rounded-lg font-mono text-lg tracking-tighter text-ink", PRESS)}
          >
            <Logo size="sm" className="rounded-md" />
            OrbitOS
          </Link>

          <div className="hidden items-center gap-8 md:flex">
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

          <div className="flex items-center gap-4 sm:gap-6">
            <Link
              href="/login"
              className={cn("rounded-lg font-sans text-sm font-medium text-ink-muted hover:text-ink", PRESS)}
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className={cn(
                "rounded-lg bg-ink px-5 py-2 text-sm font-medium text-on-ink hover:bg-white hover:shadow-[0_0_24px_rgba(255,255,255,0.12)]",
                PRESS
              )}
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>
    </>
  );
}
