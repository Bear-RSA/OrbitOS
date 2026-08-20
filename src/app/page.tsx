import Link from 'next/link';

import { AlertCircle, EyeOff, ArrowRight, Lock, ShieldCheck, Server, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { HeroProductFrame } from "@/components/marketing/hero-product-frame";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
export const metadata: Metadata = {
  title: "OrbitOS · Workspace Intelligence",
  description: "The Calm Control Center for Digital Studios.",
};

export default function LandingPage() {
  return (
    <main className="theme-dark relative isolate min-h-screen bg-[#050505] text-[#ededed] font-sans selection:bg-white/[0.1]">
      {/* Ambient light source. Gives the hero a direction without introducing a
          second colour — everything else on the page is flat. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] bg-[radial-gradient(ellipse_55%_100%_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]"
      />
      <MarketingNav active="features" />

      {/* Hero Section */}
      <section className="pt-32 md:pt-48 pb-24 md:pb-32 px-6 md:px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
        <ScrollReveal className="flex flex-col items-center">
          <Link
            href="/changelog"
            className="group inline-flex items-center gap-2.5 mb-8 transition-all duration-300"
          >
            <span className="font-mono text-[10px] tracking-[0.24em] text-[#ededed] uppercase">v1.2</span>
            <span className="h-3 w-px bg-white/[0.12]" />
            <span className="font-mono text-[10px] tracking-[0.16em] text-[#888888] uppercase group-hover:text-[#ededed] transition-colors">
              See what shipped
            </span>
            <ArrowRight className="w-3 h-3 text-[#555555] group-hover:text-[#ededed] group-hover:translate-x-0.5 transition-all" />
          </Link>
          <h1 className="text-5xl md:text-[5.5rem] font-light tracking-tighter leading-[0.95] mb-8 max-w-4xl text-[#ededed]">
            Know what needs attention. Right now.
          </h1>
          <p className="text-xl md:text-2xl text-[#888888] mx-auto max-w-2xl leading-relaxed font-light mb-12">
            OrbitOS gives studio owners the clarity they usually carry in their heads — what&apos;s
            overdue, what&apos;s at risk, and who&apos;s carrying too much. Without the noise of
            traditional project management.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-8 w-full sm:w-auto">
            <Link
              href="/signup"
              className="w-full sm:w-auto text-center bg-[#ededed] text-[#050505] px-8 py-3.5 rounded-xl font-medium text-[15px] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white hover:-translate-y-[2px] hover:shadow-[0_0_40px_rgba(255,255,255,0.1)] active:scale-95"
            >
              Start free
            </Link>
            <Link
              href="/contact-sales"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-[#888888] px-6 py-3.5 rounded-xl font-medium text-[15px] ring-1 ring-white/[0.06] hover:text-[#ededed] hover:ring-white/[0.14] transition-all duration-300"
            >
              Book a demo
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <p className="text-[13px] text-[#555555] font-light mb-20">
            Free for teams of three. Paid plans from{' '}
            <Link href="/pricing" className="text-[#888888] hover:text-[#ededed] underline underline-offset-4 decoration-white/20 transition-colors">
              R299/month
            </Link>
            , billed in rand.
          </p>
        </ScrollReveal>
        
        <ScrollReveal delay={150} className="w-full">
          <HeroProductFrame />
        </ScrollReveal>
      </section>

      {/* The Attention Grid (Bento) */}
      <section id="features" className="scroll-mt-24 py-20 px-6 md:px-8 max-w-7xl mx-auto">
        <ScrollReveal>
          <div className="mb-16">
            <span className="font-mono text-[11px] tracking-widest text-[#555555] uppercase">Core Engine</span>
            <h2 className="text-4xl font-light tracking-tight mt-4 text-[#ededed]">The Attention Grid</h2>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={100}>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-auto md:h-[600px]">
            {/* Overdue Work Alerts */}
            <div className="md:col-span-8 bg-[#0A0A0A] rounded-[24px] p-10 flex flex-col justify-between group transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ring-1 ring-white/[0.02]">
              <div>
                <AlertCircle className="w-8 h-8 text-[#E57A7A] mb-6 opacity-90" />
                <h3 className="text-2xl font-light text-[#ededed] mb-4 tracking-tight">Overdue Work Alerts</h3>
                <p className="text-[#888888] leading-relaxed max-w-md font-light text-[15px]">
                  Our deterministic algorithm flags delivery risks before they become failures. No nagging, just precision.
                </p>
              </div>
              <div className="mt-8 flex gap-4 overflow-hidden">
                <div className="flex-none w-56 p-5 bg-[#111111] rounded-xl border-l-[3px] border-[#E57A7A]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div className="font-mono text-[10px] text-[#E57A7A] mb-3">CRITICAL DELAY</div>
                  <div className="text-[14px] font-medium text-[#ededed]">Brand Identity v2</div>
                </div>
                <div className="flex-none w-56 p-5 bg-[#111111] rounded-xl border-l-[3px] border-[#555555] opacity-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div className="font-mono text-[10px] text-[#888888] mb-3">SCHEDULED</div>
                  <div className="text-[14px] font-medium text-[#ededed]">UI Kit Audit</div>
                </div>
              </div>
            </div>
            
            {/* Project Health */}
            <div className="md:col-span-4 bg-[#111111] rounded-[24px] p-10 flex flex-col items-center justify-center text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-white/[0.02]">
              <div className="relative w-32 h-32 mb-8">
                <svg className="w-full h-full transform -rotate-90">
                  <circle className="text-[#1A1A1A]" cx="64" cy="64" fill="transparent" r="60" stroke="currentColor" strokeWidth="4"></circle>
                  <circle className="text-[#ededed]/90" cx="64" cy="64" fill="transparent" r="60" stroke="currentColor" strokeDasharray="376.99" strokeDashoffset="94" strokeWidth="4"></circle>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-mono text-xl text-[#ededed] font-light">75%</div>
              </div>
              <h3 className="text-xl font-light text-[#ededed] mb-3 tracking-tight">Project Health</h3>
              <p className="text-[14px] text-[#888888] font-light px-2">Real-time aggregate status of all active workstreams.</p>
            </div>
            
            {/* Silent Task Detection */}
            <div className="md:col-span-4 bg-[#050505] rounded-[24px] p-10 border border-white/[0.04]">
              <EyeOff className="w-8 h-8 text-[#555555] mb-6" />
              <h3 className="text-xl font-light text-[#ededed] mb-4 tracking-tight">Silent Task Detection</h3>
              <p className="text-[15px] text-[#888888] leading-relaxed font-light">
                Identifying the &apos;ghost work&apos; that consumes your team&apos;s time but never makes it to the roadmap.
              </p>
            </div>
            
            {/* Data Stream */}
            <div className="md:col-span-8 bg-[#151515] rounded-[24px] p-10 flex flex-col justify-end overflow-hidden relative shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-white/[0.02]">
              <div className="absolute inset-0 opacity-[0.03] flex flex-col justify-between py-6">
                {[...Array(16)].map((_, i) => (
                   <div key={i} className="w-full h-px bg-gradient-to-r from-transparent via-[#ededed] to-transparent"></div>
                ))}
              </div>
              <div className="relative z-10">
                <h3 className="text-xl font-light text-[#ededed] mb-3 tracking-tight">Automated Studio Pulse</h3>
                <p className="text-[15px] text-[#888888] max-w-md font-light">
                  Every task, every deadline, every shift in workload — aggregated into one honest
                  read on studio health.
                </p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Studio OS Philosophy */}
      {/* Raised surface + hairline rules. The page is otherwise a flat #050505
          from nav to footer, which leaves the eye no landmarks across a long
          scroll; this is the one section given a different ground. */}
      <section className="py-28 md:py-40 px-6 md:px-8 border-y border-white/[0.04] bg-gradient-to-b from-[#090909] via-[#070707] to-[#050505]">
        <ScrollReveal>
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start gap-12 md:gap-20">
            <div className="md:w-1/2">
              <span className="font-mono text-[11px] tracking-widest text-[#ededed] uppercase">The Methodology</span>
              <h2 className="text-4xl md:text-5xl lg:text-[64px] font-light tracking-tighter mt-8 mb-12 leading-[1.05] text-[#ededed]">
                An intentional, minimal approach for agency owners.
              </h2>
            </div>
            <div className="md:w-1/2 space-y-16 mt-4">
              <div>
                <h4 className="text-2xl font-light text-[#ededed] mb-4">Eliminate the Shadow of Management</h4>
                <p className="text-[#888888] text-[16px] md:text-lg leading-relaxed font-light">
                  Standard project management tools create work about work. OrbitOS is designed to be invisible. It acts as a quiet observer, only intervening when the trajectory of a project deviates from the plan.
                </p>
              </div>
              <div>
                <h4 className="text-2xl font-light text-[#ededed] mb-4">The Architectural Void</h4>
                <p className="text-[#888888] text-[16px] md:text-lg leading-relaxed font-light">
                  We believe that space is a feature. By stripping away redundant borders, buttons, and notifications, we give your studio the mental room to breathe and focus on the craft.
                </p>
              </div>
              <div className="pt-8">
                <Link className="inline-flex items-center gap-3 text-[#ededed] font-medium hover:gap-5 transition-all text-[15px]" href="/methodology">
                  Read the full methodology 
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* CTA Section */}
      <section className="py-24 md:py-32 px-6 md:px-8">
        <ScrollReveal>
          <div className="max-w-5xl mx-auto rounded-[32px] bg-[#0A0A0A] p-16 md:p-24 text-center ring-1 ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-32 bg-gradient-to-b from-[#ededed]/30 to-transparent"></div>
            <h2 className="text-4xl md:text-6xl font-light tracking-tight mb-8 text-[#ededed]">Ready to exit the chaos?</h2>
            <p className="text-lg text-[#888888] font-light mb-12 max-w-xl mx-auto">
              Start on the free tier — three seats, three projects, no card required. Move up when
              your studio outgrows it.
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
              <Link href="/signup" className="w-full md:w-auto text-center bg-[#ededed] text-[#050505] px-10 py-4 rounded-xl font-medium text-[15px] hover:bg-white hover:-translate-y-[2px] hover:shadow-[0_0_40px_rgba(255,255,255,0.1)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                Start free
              </Link>
              <Link href="/contact-sales" className="w-full md:w-auto inline-flex items-center justify-center gap-2 text-[#888888] px-8 py-4 rounded-xl font-medium text-[15px] ring-1 ring-white/[0.06] hover:text-[#ededed] hover:ring-white/[0.14] transition-all duration-300">
                Book a demo
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Trust row. Every claim here is sourced from /security and /privacy —
                the SOC 2 attestation belongs to the hosting provider, not to
                OrbitOS, so it is worded as infrastructure. */}
            <div className="mt-16 pt-10 border-t border-white/[0.05]">
              <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
                {[
                  { icon: MapPin, label: 'POPIA-aligned' },
                  { icon: Lock, label: 'AES-256 at rest' },
                  { icon: ShieldCheck, label: 'TLS 1.2+ in transit' },
                  { icon: Server, label: 'SOC 2 Type 2 infrastructure' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <Icon className="w-3.5 h-3.5 text-[#555555]" aria-hidden />
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#6E6E6E]">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                href="/security"
                className="mt-8 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#555555] hover:text-[#ededed] transition-colors"
              >
                Read the security overview
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </section>

      <MarketingFooter />
    </main>
  );
}
