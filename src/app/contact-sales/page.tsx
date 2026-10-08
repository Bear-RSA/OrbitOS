import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { Eyebrow, OrbitMark } from "@/components/marketing/brand";

export const metadata: Metadata = {
  title: "Contact Sales · OrbitOS",
  description:
    "Get in touch with the OrbitOS sales team for enterprise pricing and custom plans.",
};

export default function ContactSalesPage() {
  return (
    <main className="theme-dark min-h-screen bg-transparent flex items-center justify-center px-6 font-mono selection:bg-orbit-amber/25">
      {/* Centered card */}
      <div
        className="relative w-full max-w-lg text-center py-20 px-10 rounded-2xl bg-surface-sunken ring-1 ring-line/[0.06]"
      >
        {/* Top accent line */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-line/[0.2] to-transparent" />

        <OrbitMark className="mx-auto mb-10 h-10 w-10" />

        <Eyebrow className="mb-8">Sales Inquiry</Eyebrow>

        {/* Heading */}
        <h1 className="font-sans text-2xl md:text-3xl font-light text-ink tracking-tight mb-6">
          Contact Sales
        </h1>

        {/* Placeholder message */}
        <p className="text-sm text-ink-dim leading-relaxed max-w-sm mx-auto mb-4">
          Our sales team will be in touch.
        </p>
        <p className="text-[11px] text-ink-dim leading-relaxed max-w-sm mx-auto mb-12">
          The Total Visibility plan is tailored to studios that need deeper
          operational control. Reach out and we&apos;ll scope a plan that fits
          your team.
        </p>

        {/* Placeholder email */}
        <div
          className="inline-block px-6 py-3 rounded-xl text-[12px] text-ink-dim tracking-widest uppercase mb-12 ring-1 ring-line/[0.06]"
        >
          sales@orbitos.dev
        </div>

        {/* Divider */}
        <div className="w-16 h-px bg-surface-control mx-auto mb-12" />

        {/* Return button */}
        <Link
          href="/"
          className="inline-flex items-center gap-3 px-8 py-3.5 rounded-xl text-[11px] uppercase tracking-[0.2em] text-ink transition-all duration-300 hover:bg-surface-card ring-1 ring-line/[0.06]"
        >
          <ArrowLeft className="w-3.5 h-3.5 opacity-50" />
          Return to Homepage
        </Link>
      </div>
    </main>
  );
}
