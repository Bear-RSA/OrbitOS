import Link from 'next/link';
import Image from 'next/image';
import { Logo } from "@/components/brand/logo";

import { AlertCircle, EyeOff, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import { ScrollReveal } from "@/components/ui/scroll-reveal";
export const metadata: Metadata = {
  title: "OrbitOS · Workspace Intelligence",
  description: "The Calm Control Center for Digital Studios.",
};

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-[#ededed] font-sans selection:bg-white/[0.1]">
      {/* TopNavBar */}
      <nav className="fixed top-0 w-full z-50 bg-[#050505]/70 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="flex justify-between items-center max-w-7xl mx-auto px-8 h-16">
          <div className="font-mono text-lg tracking-tighter text-[#ededed] flex items-center gap-3">
             <Logo size="sm" className="rounded-md" />
             OrbitOS
          </div>
          <div className="hidden md:flex items-center gap-8">
            <Link className="font-sans tracking-tight font-medium text-[#ededed] border-b border-[#ededed] pb-1 hover:text-white transition-colors duration-300" href="#">Features</Link>
            <Link className="font-sans tracking-tight font-light text-[#888888] hover:text-[#ededed] transition-colors duration-300" href="/methodology">Methodology</Link>
            <Link className="font-sans tracking-tight font-light text-[#888888] hover:text-[#ededed] transition-colors duration-300" href="/pricing">Pricing</Link>
            <Link className="font-sans tracking-tight font-light text-[#888888] hover:text-[#ededed] transition-colors duration-300" href="/changelog">Changelog</Link>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-[#888888] font-sans font-medium text-sm hover:text-[#ededed] transition-colors">Sign In</Link>
            <Link href="/signup" className="bg-[#ededed] text-[#050505] px-5 py-2 rounded-lg font-medium text-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px] hover:bg-white active:scale-95">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-48 pb-32 px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
        <ScrollReveal className="flex flex-col items-center">
          <span className="font-mono text-[10px] tracking-[0.3em] text-[#555555] uppercase mb-8 block">OSO Beta v1.1 Void</span>
          <h1 className="text-5xl md:text-[5.5rem] font-light tracking-tighter leading-[0.95] mb-8 max-w-4xl text-[#ededed]">
            The Calm Control Center for Digital Studios.
          </h1>
          <p className="text-xl md:text-2xl text-[#888888] mx-auto max-w-2xl leading-relaxed font-light mb-12">
            OrbitOS surfaces what needs attention right now, eliminating the noise of traditional project management.
          </p>
        </ScrollReveal>
        
        <ScrollReveal delay={150} className="w-full">
          <div className="w-full aspect-[21/9] rounded-2xl overflow-hidden bg-[#0A0A0A] ring-1 ring-white/[0.04] shadow-[0_20px_60px_rgba(0,0,0,0.8)] relative group">
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[transparent_20%] to-transparent z-10"></div>
            
            <div className="absolute inset-0 z-20 flex items-center justify-center overflow-hidden">
              {/* Abstract Architectural Visualization */}
              <div className="absolute inset-0 flex items-center justify-center" style={{ perspective: '1000px' }}>
                <div className="relative w-[600px] h-[300px]" style={{ transformStyle: 'preserve-3d', transform: 'rotateX(55deg) rotateZ(45deg)' }}>
                  {/* Active Node */}
                  <div className="absolute inset-0 border border-white/[0.08] bg-[#111111]/60 backdrop-blur-sm rounded-2xl shadow-[0_0_60px_rgba(255,255,255,0.02)] transition-transform duration-1000 hover:-translate-y-2" style={{ transform: 'translateZ(40px)' }}>
                    <div className="absolute top-6 left-6 font-mono text-[10px] text-[#ededed]/40 uppercase tracking-widest">Active_Node_01</div>
                    <div className="absolute bottom-6 right-6 flex gap-2">
                      <div className="w-16 h-1.5 bg-white/20 rounded"></div>
                      <div className="w-6 h-1.5 bg-white/10 rounded"></div>
                    </div>
                  </div>
                  {/* System State */}
                  <div className="absolute inset-0 border border-white/[0.04] bg-[#0A0A0A]/80 rounded-2xl" style={{ transform: 'translateZ(0px) translateY(-50px) translateX(40px)' }}>
                    <div className="absolute top-6 left-6 font-mono text-[10px] text-[#888888]/30 uppercase tracking-widest">System_State</div>
                  </div>
                  {/* Attention Matrix */}
                  <div className="absolute inset-0 border border-white/[0.02] bg-[#1A1A1A]/30 rounded-2xl" style={{ transform: 'translateZ(90px) translateY(50px) translateX(-40px)' }}>
                    <div className="absolute top-6 left-6 font-mono text-[10px] text-[#ededed]/20 uppercase tracking-widest">Attention_Matrix</div>
                  </div>
                  
                  {/* Blueprint Lines */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent rotate-12"></div>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent -rotate-12"></div>
                </div>
              </div>
              
              {/* Minimal HUD Elements */}
              <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end">
                <div className="flex flex-col gap-2">
                  <div className="font-mono text-[10px] text-[#555555] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ededed]/60 animate-pulse"></span>
                    COORD_X: 45.281
                  </div>
                  <div className="font-mono text-[10px] text-[#555555]">COORD_Y: 12.904</div>
                </div>
                <div className="font-mono text-[10px] text-[#555555] tracking-[0.3em]">ORBIT_PROTOCOL_V2.VOID</div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* The Attention Grid (Bento) */}
      <section className="py-20 px-8 max-w-7xl mx-auto">
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
                Identifying the 'ghost work' that consumes your team's time but never makes it to the roadmap.
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
                  Every commit, every message, every pixel — synthesized into a single stream of architectural truth.
                </p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Studio OS Philosophy */}
      <section className="py-40 px-8 bg-[#050505]">
        <ScrollReveal>
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start gap-20">
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
      <section className="py-32 px-8">
        <ScrollReveal>
          <div className="max-w-5xl mx-auto rounded-[32px] bg-[#0A0A0A] p-16 md:p-24 text-center ring-1 ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-32 bg-gradient-to-b from-[#ededed]/30 to-transparent"></div>
            <h2 className="text-4xl md:text-6xl font-light tracking-tight mb-8 text-[#ededed]">Ready to exit the chaos?</h2>
            <p className="text-lg text-[#888888] font-light mb-12 max-w-xl mx-auto">
              Join over 400 world-class studios using OrbitOS to run their operations with surgical precision.
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <Link href="/signup" className="bg-[#ededed] text-[#050505] px-10 py-4 rounded-xl font-medium text-[15px] hover:bg-white hover:-translate-y-[2px] hover:shadow-[0_0_40px_rgba(255,255,255,0.1)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                Get Started
              </Link>
            </div>
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
