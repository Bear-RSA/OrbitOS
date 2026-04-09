import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { ScrollReveal } from "@/components/ui/scroll-reveal";

export const metadata: Metadata = {
  title: "Changelog · OrbitOS",
  description: "A record of how OrbitOS is evolving — one release at a time.",
};

export default function ChangelogPage() {
  const entries = [
    {
      title: "Identity & Access Stabilization",
      desc: "Reworked authentication flow to prevent cross-workspace identity corruption. Strengthened role enforcement across the system."
    },
    {
      title: "Real-Time Workspace Sync",
      desc: "Introduced live profile syncing. Workspace state now updates instantly without requiring refresh."
    },
    {
      title: "Project Deletion Protocol",
      desc: "Implemented secure server-side cascade deletion with confirmation safeguards."
    },
    {
      title: "Operational Dashboard Refinement",
      desc: "Improved task visibility and clarified project-task relationships."
    },
    {
      title: "Design System Alignment",
      desc: "Unified UI under the Architectural Void system. Removed legacy color inconsistencies."
    },
    {
      title: "Methodology Page",
      desc: "Introduced OrbitOS methodology as a structured operational philosophy."
    }
  ];

  return (
    <main className="min-h-screen bg-[#050505] text-[#ededed] font-sans selection:bg-white/[0.1]">
      {/* TopNavBar */}
      <nav className="fixed top-0 w-full z-50 bg-[#050505]/70 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="flex justify-between items-center max-w-7xl mx-auto px-8 h-16">
          <Link href="/" className="font-mono text-lg tracking-tighter text-[#ededed] flex items-center gap-3">
             <div className="w-6 h-6 rounded-md bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] relative overflow-hidden">
               <Image src="/logo.png" alt="OrbitOS" fill className="object-cover" />
             </div>
             OrbitOS
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link className="font-sans tracking-tight font-light text-[#888888] hover:text-[#ededed] transition-colors duration-300" href="#">Features</Link>
            <Link className="font-sans tracking-tight font-light text-[#888888] hover:text-[#ededed] transition-colors duration-300" href="/methodology">Methodology</Link>
            <Link className="font-sans tracking-tight font-light text-[#888888] hover:text-[#ededed] transition-colors duration-300" href="/pricing">Pricing</Link>
            <Link className="font-sans tracking-tight font-medium text-[#ededed] border-b border-[#ededed] pb-1 hover:text-white transition-colors duration-300" href="/changelog">Changelog</Link>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-[#888888] font-sans font-medium text-sm hover:text-[#ededed] transition-colors">Sign In</Link>
            <Link href="/signup" className="bg-[#ededed] text-[#050505] px-5 py-2 rounded-lg font-medium text-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px] hover:bg-white active:scale-95">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-48 pb-20 px-8 max-w-7xl mx-auto">
        <ScrollReveal className="flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] mb-8">
            <span className="font-mono text-[10px] tracking-[0.2em] text-[#ededed] uppercase">The Record</span>
          </div>
          <h1 className="text-5xl md:text-[5.5rem] font-light tracking-tighter leading-[0.95] mb-8 text-[#ededed]">
            Changelog
          </h1>
          <p className="text-xl md:text-2xl text-[#888888] mx-auto max-w-2xl leading-relaxed font-light">
            A record of how OrbitOS is evolving — one release at a time.
          </p>
          <div className="mt-20 w-px h-24 bg-gradient-to-b from-white/[0.1] to-transparent mx-auto"></div>
        </ScrollReveal>
      </section>

      {/* Changelog Content */}
      <section className="pb-48 px-8 max-w-3xl mx-auto">
        <ScrollReveal>
          <div className="mb-20">
            <h2 className="font-mono text-[11px] tracking-[0.3em] text-[#555555] uppercase mb-12 flex items-center gap-4">
              April 2026
              <span className="flex-grow h-px bg-white/[0.04]"></span>
            </h2>

            <div className="space-y-24">
              {entries.map((item, i) => (
                <div key={i} className="group relative">
                  <h3 className="text-2xl font-light text-[#ededed] mb-4 tracking-tight group-hover:text-white transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-[#888888] leading-relaxed font-light text-[16px] md:text-lg">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="mt-40 p-12 rounded-[24px] bg-[#0A0A0A] border border-white/[0.04] text-center">
            <h4 className="text-lg font-light text-[#ededed] mb-4">Stay Synchronized</h4>
            <p className="text-[#888888] text-sm font-light mb-8 max-w-md mx-auto">
              Follow our progress as we refine the architectural operating system for digital studios.
            </p>
            <Link href="/signup" className="text-[#ededed] text-sm font-medium border-b border-white/[0.1] pb-1 hover:border-white transition-all">
              Join the evolution
            </Link>
          </div>
        </ScrollReveal>
      </section>

      {/* Footer */}
      <footer className="bg-[#050505] border-t border-white/[0.04] w-full py-20">
        <div className="flex flex-col md:flex-row justify-between items-center max-w-7xl mx-auto px-8 md:px-16 gap-12 md:gap-0">
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="font-mono font-bold text-[#ededed] text-xl tracking-tight">OrbitOS</div>
            <p className="font-mono text-[10px] tracking-widest uppercase text-[#555555]">© {new Date().getFullYear()} OrbitOS. Built for the architectural void.</p>
          </div>
          <div className="flex gap-8 md:gap-12">
            <Link className="font-mono text-[10px] tracking-widest uppercase text-[#555555] hover:text-[#ededed] transition-colors" href="/privacy">Privacy</Link>
            <Link className="font-mono text-[10px] tracking-widest uppercase text-[#555555] hover:text-[#ededed] transition-colors" href="/terms">Terms</Link>
            <Link className="font-mono text-[10px] tracking-widest uppercase text-[#555555] hover:text-[#ededed] transition-colors" href="/security">Security</Link>
            <Link className="font-mono text-[10px] tracking-widest uppercase text-[#555555] hover:text-[#ededed] transition-colors" href="https://github.com/MiraiStack">GitHub</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
