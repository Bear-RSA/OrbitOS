import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils/classnames";

/**
 * The single top bar for every marketing page.
 *
 * Previously each page inlined its own copy, and they had already drifted:
 * the landing page used <Logo> while the other six hand-rolled a
 * `div + next/image` block, and the wordmark linked home on some pages but
 * not others. One component, one active-state treatment.
 */

type NavKey = "features" | "methodology" | "pricing" | "changelog";

const LINKS: { key: NavKey; label: string; href: string }[] = [
  { key: "features", label: "Features", href: "/#features" },
  { key: "methodology", label: "Methodology", href: "/methodology" },
  { key: "pricing", label: "Pricing", href: "/pricing" },
  { key: "changelog", label: "Changelog", href: "/changelog" },
];

export function MarketingNav({ active }: { active?: NavKey }) {
  return (
    <nav className="fixed top-0 w-full z-50 bg-[#050505]/70 backdrop-blur-xl border-b border-white/[0.04]">
      <div className="flex justify-between items-center max-w-7xl mx-auto px-6 md:px-8 h-16">
        <Link
          href="/"
          className="font-mono text-lg tracking-tighter text-[#ededed] flex items-center gap-3"
        >
          <Logo size="sm" className="rounded-md" />
          OrbitOS
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {LINKS.map(({ key, label, href }) => (
            <Link
              key={key}
              href={href}
              aria-current={active === key ? "page" : undefined}
              className={cn(
                "font-sans tracking-tight transition-colors duration-300",
                active === key
                  ? "font-medium text-[#ededed] border-b border-[#ededed] pb-1 hover:text-white"
                  : "font-light text-[#888888] hover:text-[#ededed]"
              )}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/login"
            className="text-[#888888] font-sans font-medium text-sm hover:text-[#ededed] transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="bg-[#ededed] text-[#050505] px-5 py-2 rounded-lg font-medium text-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px] hover:bg-white active:scale-95"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}
