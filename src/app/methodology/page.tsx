import Link from 'next/link';
import {
  Target,
  Shield,
  Zap,
  Layers,
  CheckCircle2,
  Inbox,
  GitBranch,
  Crosshair,
  LineChart,
} from 'lucide-react';
import type { Metadata } from 'next';
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

export const metadata: Metadata = {
  title: "Methodology",
  description: "An intentional operating discipline for digital studios.",
};

/**
 * The four phases of the operating loop. Rendered as a connected sequence —
 * a horizontal rail on desktop, a vertical one on mobile — so the steps read
 * as one continuous cycle rather than four unrelated columns.
 */
const WORKFLOW = [
  {
    step: "01",
    title: "Capture",
    icon: Inbox,
    desc: "Aggregating every signal and requirement into a single, unified inbox. Nothing is lost, every detail is accounted for.",
  },
  {
    step: "02",
    title: "Structure",
    icon: GitBranch,
    desc: "Translating raw inputs into actionable architecture. Defining the roadmap, dependencies, and owners.",
  },
  {
    step: "03",
    title: "Execute",
    icon: Crosshair,
    desc: "Moving with surgical precision. The system clears the noise so the team can focus solely on the craft.",
  },
  {
    step: "04",
    title: "Review",
    icon: LineChart,
    desc: "Analyzing outcome against intent. Using data-driven insights to refine the next cycle of execution.",
  },
];

export default function MethodologyPage() {
  return (
    <main className="theme-dark min-h-screen bg-[#050505] text-[#ededed] font-sans selection:bg-white/[0.1]">
      {/* TopNavBar - Replicated for consistency */}
      <MarketingNav active="methodology" />

      {/* Hero Section */}
      <section className="pt-48 pb-32 px-8 max-w-7xl mx-auto">
        <ScrollReveal className="flex flex-col items-center text-center">
          <span className="font-mono text-[10px] tracking-[0.3em] text-[#555555] uppercase mb-8 block">Operational Discipline</span>
          <h1 className="text-5xl md:text-[5.5rem] font-light tracking-tighter leading-[0.95] mb-8 max-w-4xl text-[#ededed]">
            Methodology
          </h1>
          <p className="text-xl md:text-2xl text-[#888888] mx-auto max-w-2xl leading-relaxed font-light mb-12">
            OrbitOS is built around operational clarity, controlled execution, and deliberate team movement. We believe software should facilitate discipline, not create noise.
          </p>
          
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-white/[0.2] to-transparent mb-12"></div>
        </ScrollReveal>
      </section>

      {/* Principle Grid */}
      <section className="py-20 px-8 max-w-7xl mx-auto">
        <ScrollReveal>
          <div className="mb-16">
            <span className="font-mono text-[11px] tracking-widest text-[#555555] uppercase">Core Principles</span>
            <h2 className="text-4xl font-light tracking-tight mt-4 text-[#ededed]">The Foundation of OrbitOS</h2>
          </div>
        </ScrollReveal>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ScrollReveal delay={100}>
            <InteractiveCard className="p-10 h-full">
              <div className="flex flex-col h-full">
                <Target className="w-8 h-8 text-[#ededed] mb-8 opacity-80" />
                <h3 className="text-2xl font-light text-[#ededed] mb-4 tracking-tight">Clarity Before Motion</h3>
                <p className="text-[#888888] leading-relaxed font-light text-[15px]">
                  Execution without clarity is just noise. We force the definition of objectives before a single pixel is moved, ensuring every action contributes to the final outcome.
                </p>
              </div>
            </InteractiveCard>
          </ScrollReveal>
          
          <ScrollReveal delay={200}>
            <InteractiveCard className="p-10 h-full">
              <div className="flex flex-col h-full">
                <Layers className="w-8 h-8 text-[#ededed] mb-8 opacity-80" />
                <h3 className="text-2xl font-light text-[#ededed] mb-4 tracking-tight">Systems Over Chaos</h3>
                <p className="text-[#888888] leading-relaxed font-light text-[15px]">
                  Chaos scales linearly; systems scale exponentially. OrbitOS provides the architectural framework that allows your team to operate within a repeatable, disciplined structure.
                </p>
              </div>
            </InteractiveCard>
          </ScrollReveal>
          
          <ScrollReveal delay={300}>
            <InteractiveCard className="p-10 h-full">
              <div className="flex flex-col h-full">
                <Shield className="w-8 h-8 text-[#ededed] mb-8 opacity-80" />
                <h3 className="text-2xl font-light text-[#ededed] mb-4 tracking-tight">Ownership With Visibility</h3>
                <p className="text-[#888888] leading-relaxed font-light text-[15px]">
                  Accountability is built on radical transparency. By making ownership explicit and progress visible, we eliminate the need for status meetings and micro-management.
                </p>
              </div>
            </InteractiveCard>
          </ScrollReveal>
          
          <ScrollReveal delay={400}>
            <InteractiveCard className="p-10 h-full">
              <div className="flex flex-col h-full">
                <Zap className="w-8 h-8 text-[#ededed] mb-8 opacity-80" />
                <h3 className="text-2xl font-light text-[#ededed] mb-4 tracking-tight">Execution That Compounds</h3>
                <p className="text-[#888888] leading-relaxed font-light text-[15px]">
                  Small, disciplined steps lead to massive results. Our methodology focuses on continuous, incremental progress that builds velocity and compounds over time.
                </p>
              </div>
            </InteractiveCard>
          </ScrollReveal>
        </div>
      </section>

      {/* Workflow Section */}
      <section className="py-32 md:py-40 px-6 md:px-8 bg-[#0A0A0A]/50 border-y border-white/[0.04]">
        <div className="max-w-7xl mx-auto">
          <ScrollReveal>
            <div className="mb-20 md:mb-24 text-center">
              <span className="font-mono text-[11px] tracking-widest text-[#555555] uppercase">Operational Flow</span>
              <h2 className="text-4xl md:text-5xl font-light tracking-tight mt-4 text-[#ededed]">How OrbitOS Operates</h2>
              <p className="text-[#888888] text-base md:text-lg font-light leading-relaxed mt-6 max-w-lg mx-auto">
                One continuous loop. Each phase hands clean inputs to the next, and the last one feeds the first.
              </p>
            </div>
          </ScrollReveal>

          {/* The rail lives inside this ScrollReveal so it rises with the step
              nodes as one unit. The per-step reveals below use yOffset={0} —
              a staggered translate would drift the nodes off the rail
              mid-animation. */}
          <ScrollReveal className="relative">
            {/* Connector rail — horizontal on desktop, vertical on mobile. The
                opaque step nodes sit on top of it, segmenting the line. */}
            <div
              aria-hidden="true"
              className="hidden md:block absolute left-0 right-0 top-[27px] h-px bg-gradient-to-r from-transparent via-white/[0.1] to-transparent"
            />
            <div
              aria-hidden="true"
              className="md:hidden absolute left-[27px] top-3 bottom-3 w-px bg-gradient-to-b from-transparent via-white/[0.1] to-transparent"
            />

            <ol className="grid grid-cols-1 md:grid-cols-4 gap-y-10 md:gap-y-0 md:gap-x-10">
              {WORKFLOW.map((item, i) => {
                const Icon = item.icon;
                return (
                  <li key={item.step}>
                    <ScrollReveal delay={200 + i * 120} yOffset={0} className="group h-full">
                      <div className="flex md:flex-col gap-5 md:gap-0">
                        {/* Node */}
                        <div className="flex-none w-[54px] h-[54px] rounded-2xl bg-[#0A0A0A] ring-1 ring-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:ring-white/[0.18] group-hover:bg-[#111111] group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_32px_rgba(0,0,0,0.5)] md:group-hover:-translate-y-[3px]">
                          <Icon
                            aria-hidden="true"
                            className="w-[18px] h-[18px] text-[#666666] transition-colors duration-500 group-hover:text-[#ededed]"
                          />
                        </div>

                        <div className="md:mt-8 md:pr-4">
                          <span className="font-mono text-[10px] tracking-[0.3em] text-[#555555] transition-colors duration-500 group-hover:text-[#888888]">
                            {item.step}
                          </span>
                          <h3 className="text-xl font-light text-[#ededed] mt-3 mb-3 tracking-tight">
                            {item.title}
                          </h3>
                          <p className="text-[#888888] text-sm leading-relaxed font-light">
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    </ScrollReveal>
                  </li>
                );
              })}
            </ol>
          </ScrollReveal>
        </div>
      </section>

      {/* Why It Works Section */}
      <section className="py-40 px-8 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-start gap-20">
          <div className="md:w-1/2">
            <ScrollReveal>
              <span className="font-mono text-[11px] tracking-widest text-[#555555] uppercase">Business Value</span>
              <h2 className="text-4xl md:text-5xl font-light tracking-tighter mt-8 mb-12 text-[#ededed]">
                Precision as a Competitive Advantage
              </h2>
              <p className="text-[#888888] text-lg leading-relaxed font-light max-w-md">
                Efficiency is not just about doing things faster—it is about doing the right things with minimal wasted motion.
              </p>
            </ScrollReveal>
          </div>
          <div className="md:w-1/2 space-y-12">
            {[
              { title: "Less Owner Bottleneck", desc: "Systematize your intuition. Free yourself from being the single point of failure by empowering your team with clear protocols." },
              { title: "Clearer Team Accountability", desc: "No more 'who is doing what?' Every task has an owner, every owner has a deadline, and every deadline is visible." },
              { title: "Less Operational Drift", desc: "Projects stay on track by default. OrbitOS identifies deviations early, allowing for course correction before it's too late." },
              { title: "Better Delivery Rhythm", desc: "Consistent, predictable output builds trust with clients and allows your studio to scale without losing quality." }
            ].map((item, i) => (
              <ScrollReveal key={i} delay={i * 100}>
                <div className="flex gap-6">
                  <div className="flex-none mt-1">
                    <CheckCircle2 className="w-5 h-5 text-[#ededed]/40" />
                  </div>
                  <div>
                    <h4 className="text-xl font-light text-[#ededed] mb-2">{item.title}</h4>
                    <p className="text-[#888888] text-[15px] leading-relaxed font-light">
                      {item.desc}
                    </p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-8">
        <ScrollReveal>
          <div className="max-w-5xl mx-auto rounded-[32px] bg-[#0A0A0A] p-16 md:p-24 text-center ring-1 ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-32 bg-gradient-to-b from-[#ededed]/30 to-transparent"></div>
            <h2 className="text-4xl md:text-6xl font-light tracking-tight mb-8 text-[#ededed]">Join the movement</h2>
            <p className="text-lg text-[#888888] font-light mb-12 max-w-xl mx-auto">
              Ready to implement a higher level of operational discipline? OrbitOS is waiting.
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <Link href="/signup" className="bg-[#ededed] text-[#050505] px-10 py-4 rounded-xl font-medium text-[15px] hover:bg-white hover:-translate-y-[2px] hover:shadow-[0_0_40px_rgba(255,255,255,0.1)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                Get Started
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Footer - Replicated */}
      <MarketingFooter />
    </main>
  );
}
