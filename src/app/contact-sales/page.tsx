import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Sales · OrbitOS",
  description:
    "Get in touch with the OrbitOS sales team for enterprise pricing and custom plans.",
};

export default function ContactSalesPage() {
  return (
    <main className="min-h-screen bg-[#000000] flex items-center justify-center px-6 font-mono selection:bg-white/[0.08]">
      {/* Centered card */}
      <div
        className="relative w-full max-w-lg text-center py-20 px-10 rounded-2xl"
        style={{
          border: "1px solid #1a1a1a",
          background: "#000000",
        }}
      >
        {/* Top accent line */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-[#333333] to-transparent" />

        {/* Mono label */}
        <span className="text-[10px] tracking-[0.35em] uppercase text-[#444444] block mb-8">
          Sales Inquiry
        </span>

        {/* Heading */}
        <h1 className="text-2xl md:text-3xl font-light text-[#ededed] tracking-tight mb-6">
          Contact Sales
        </h1>

        {/* Placeholder message */}
        <p className="text-sm text-[#666666] leading-relaxed max-w-sm mx-auto mb-4">
          Our sales team will be in touch.
        </p>
        <p className="text-[11px] text-[#444444] leading-relaxed max-w-sm mx-auto mb-12">
          The Total Visibility plan is tailored to studios that need deeper
          operational control. Reach out and we&apos;ll scope a plan that fits
          your team.
        </p>

        {/* Placeholder email */}
        <div
          className="inline-block px-6 py-3 rounded-xl text-[12px] text-[#555555] tracking-widest uppercase mb-12"
          style={{ border: "1px solid #1a1a1a" }}
        >
          sales@orbitos.dev
        </div>

        {/* Divider */}
        <div className="w-16 h-px bg-[#1a1a1a] mx-auto mb-12" />

        {/* Return button */}
        <Link
          href="/"
          className="inline-flex items-center gap-3 px-8 py-3.5 rounded-xl text-[11px] uppercase tracking-[0.2em] text-[#ededed] transition-all duration-300 hover:bg-[#0a0a0a]"
          style={{ border: "1px solid #1a1a1a" }}
        >
          <ArrowLeft className="w-3.5 h-3.5 opacity-50" />
          Return to Homepage
        </Link>
      </div>
    </main>
  );
}
