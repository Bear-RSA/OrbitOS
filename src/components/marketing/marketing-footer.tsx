import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/**
 * The single footer for every marketing page.
 *
 * Structured into columns rather than the previous single row of four mono
 * links — footer density is a "real company" signal, and the old version gave
 * the reader no map of the site.
 */

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Changelog", href: "/changelog" },
      { label: "Methodology", href: "/methodology" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Contact Sales", href: "/contact-sales" },
      { label: "Sign In", href: "/login" },
      { label: "GitHub", href: "https://github.com/MiraiStack" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Security", href: "/security" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="bg-[#050505] border-t border-white/[0.04] w-full">
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-16 md:py-20">
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-5 md:gap-x-12">
          {/* Brand block */}
          <div className="col-span-2 flex flex-col gap-5">
            <Link href="/" className="flex items-center gap-3 w-fit">
              <Logo size="sm" className="rounded-md" />
              <span className="font-mono text-lg tracking-tighter text-[#ededed]">OrbitOS</span>
            </Link>
            <p className="text-[14px] font-light leading-relaxed text-[#888888] max-w-[28ch]">
              The calm control center for digital studios. Built in South Africa.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading} className="flex flex-col gap-5">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#555555]">
                {column.heading}
              </h3>
              <ul className="flex flex-col gap-3.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[14px] font-light text-[#888888] hover:text-[#ededed] transition-colors duration-300"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-white/[0.04] pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#555555]">
            © {new Date().getFullYear()} OrbitOS
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#555555]">
            Built for the architectural void
          </p>
        </div>
      </div>
    </footer>
  );
}
