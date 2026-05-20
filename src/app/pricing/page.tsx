import Link from 'next/link';
import Image from 'next/image';
import { CheckCircle2, ArrowRight, Shield, Zap, Target, Layers } from 'lucide-react';
import type { Metadata } from 'next';
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { InteractiveCard } from "@/components/ui/interactive-card";

export const metadata: Metadata = {
  title: "Pricing · OrbitOS",
  description: "Flexible operational leverage for teams of all sizes.",
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-[#ededed] font-sans selection:bg-white/[0.1]">
      {/* TopNavBar */}
      <nav className="fixed top-0 w-full z-50 bg-[#050505]/70 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="flex justify-between items-center max-w-7xl mx-auto px-8 h-16">
          <Link href="/" className="font-mono text-lg tracking-tighter text-[#ededed] flex items-center gap-3">
             <div className="w-6 h-6 rounded-md bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] relative overflow-hidden">
               <Image src="/logo.png" alt="OrbitOS" fill className="object-cover rounded-[inherit]" />
             </div>
             OrbitOS
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link className="font-sans tracking-tight font-light text-[#888888] hover:text-[#ededed] transition-colors duration-300" href="#">Features</Link>
            <Link className="font-sans tracking-tight font-light text-[#888888] hover:text-[#ededed] transition-colors duration-300" href="/methodology">Methodology</Link>
            <Link className="font-sans tracking-tight font-medium text-[#ededed] border-b border-[#ededed] pb-1 hover:text-white transition-colors duration-300" href="/pricing">Pricing</Link>
            <Link className="font-sans tracking-tight font-light text-[#888888] hover:text-[#ededed] transition-colors duration-300" href="/changelog">Changelog</Link>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-[#888888] font-sans font-medium text-sm hover:text-[#ededed] transition-colors">Sign In</Link>
            <Link href="/signup" className="bg-[#ededed] text-[#050505] px-5 py-2 rounded-lg font-medium text-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px] hover:bg-white active:scale-95">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-48 pb-32 px-8 max-w-7xl mx-auto">
        <ScrollReveal className="flex flex-col items-center text-center">
          <span className="font-mono text-[10px] tracking-[0.3em] text-[#555555] uppercase mb-8 block">Operational Scale</span>
          <h1 className="text-5xl md:text-[5.5rem] font-light tracking-tighter leading-[0.95] mb-8 max-w-4xl text-[#ededed]">
            Pricing
          </h1>
          <p className="text-xl md:text-2xl text-[#888888] mx-auto max-w-2xl leading-relaxed font-light mb-12">
            OrbitOS is an operating system for disciplined teams. Choose the tier that matches your studio&apos;s output and operational complexity.
          </p>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-white/[0.2] to-transparent"></div>
        </ScrollReveal>
      </section>

      {/* Pricing Tiers */}
      <section className="py-20 px-8 max-w-[95rem] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Free */}
          <ScrollReveal delay={100}>
            <InteractiveCard className="p-10 h-full flex flex-col border border-white/[0.02]">
              <div className="mb-8">
                <span className="font-mono text-[11px] tracking-widest text-[#555555] uppercase">Exploration</span>
                <h3 className="text-2xl font-light text-[#ededed] mt-2 mb-4 tracking-tight">Free</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-light text-[#ededed]">R0</span>
                  <span className="text-[#555555] font-light text-sm">/mo</span>
                </div>
                <p className="text-[#888888] text-sm mt-4 font-light leading-relaxed">For testing OrbitOS with a very small team.</p>
              </div>
              <ul className="space-y-4 mb-12 flex-grow">
                {[
                  '1 Owner + 2 Members',
                  'Core Dashboard',
                  'Task Management',
                  'Team Invites',
                  'Basic Visibility',
                  'Limited Projects'
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-[#ededed]/50 font-light">
                    <CheckCircle2 className="w-4 h-4 text-[#ededed]/20" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="block w-full py-4 rounded-xl border border-white/[0.04] bg-[#111111] text-[#ededed] text-center text-sm font-medium hover:bg-[#1a1a1a] transition-all duration-300">
                Get Started
              </Link>
            </InteractiveCard>
          </ScrollReveal>

          {/* Starter */}
          <ScrollReveal delay={200}>
            <InteractiveCard className="p-10 h-full flex flex-col border border-white/[0.02]">
              <div className="mb-8">
                <span className="font-mono text-[11px] tracking-widest text-[#555555] uppercase">Foundational</span>
                <h3 className="text-2xl font-light text-[#ededed] mt-2 mb-4 tracking-tight">Starter</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-light text-[#ededed]">R499</span>
                  <span className="text-[#555555] font-light text-sm">/mo</span>
                </div>
                <p className="text-[#888888] text-sm mt-4 font-light leading-relaxed">For small teams building structure and discipline.</p>
              </div>
              <ul className="space-y-4 mb-12 flex-grow">
                {[
                  '1 Owner + 5 Members',
                  '5 Active Projects',
                  'Core visibility layer',
                  'Simple status signals',
                  'Email notifications',
                  'Standard support'
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-[#ededed]/70 font-light">
                    <CheckCircle2 className="w-4 h-4 text-[#ededed]/30" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="block w-full py-4 rounded-xl border border-white/[0.04] bg-[#111111] text-[#ededed] text-center text-sm font-medium hover:bg-[#1a1a1a] transition-all duration-300">
                Start Trial
              </Link>
            </InteractiveCard>
          </ScrollReveal>

          {/* Team - Primary Plan */}
          <ScrollReveal delay={300}>
            <InteractiveCard className="p-10 h-full flex flex-col ring-1 ring-white/[0.1] bg-[#0A0A0A] relative border border-white/[0.05]">
              <div className="absolute top-0 right-10 -translate-y-1/2">
                <div className="bg-[#ededed] text-[#050505] text-[10px] font-mono px-3 py-1 rounded-full uppercase tracking-widest font-bold">Recommended</div>
              </div>
              <div className="mb-8">
                <span className="font-mono text-[11px] tracking-widest text-[#ededed] uppercase">Studio Core</span>
                <h3 className="text-2xl font-light text-[#ededed] mt-2 mb-4 tracking-tight">Team</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-light text-[#ededed]">R1,299</span>
                  <span className="text-[#555555] font-light text-sm">/mo</span>
                </div>
                <p className="text-[#888888] text-sm mt-4 font-light leading-relaxed">For active agencies running delivery with clarity.</p>
              </div>
              <ul className="space-y-4 mb-12 flex-grow">
                {[
                  '3 Owners + 10 Members',
                  '10 Active Projects',
                  'Full operational dashboard',
                  'Team workload awareness',
                  'Execution insights',
                  'Priority support'
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-[#ededed] font-light">
                    <CheckCircle2 className="w-4 h-4 text-[#ededed]/60" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="block w-full py-4 rounded-xl bg-[#ededed] text-[#050505] text-center text-sm font-medium hover:bg-white hover:-translate-y-[2px] transition-all duration-300 shadow-[0_0_40px_rgba(255,255,255,0.05)]">
                Get Started
              </Link>
            </InteractiveCard>
          </ScrollReveal>

          {/* Growth */}
          <ScrollReveal delay={400}>
            <InteractiveCard className="p-10 h-full flex flex-col border border-white/[0.02]">
              <div className="mb-8">
                <span className="font-mono text-[11px] tracking-widest text-[#555555] uppercase">Total Visibility</span>
                <h3 className="text-2xl font-light text-[#ededed] mt-2 mb-4 tracking-tight">Growth</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-light text-[#ededed]">R2,499</span>
                  <span className="text-[#555555] font-light text-sm">/mo</span>
                </div>
                <p className="text-[#888888] text-sm mt-4 font-light leading-relaxed">For scaling teams that need deeper control.</p>
              </div>
              <ul className="space-y-4 mb-12 flex-grow">
                {[
                  '5 Owners + Unlimited Members',
                  'Premium Project Capacity',
                  'Workload intelligence',
                  'Sophisticated reporting layer',
                  'Advanced permissions',
                  'Premium support'
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-[#ededed]/70 font-light">
                    <CheckCircle2 className="w-4 h-4 text-[#ededed]/30" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="block w-full py-4 rounded-xl border border-white/[0.04] bg-[#111111] text-[#ededed] text-center text-sm font-medium hover:bg-[#1a1a1a] transition-all duration-300">
                Contact Sales
              </Link>
            </InteractiveCard>
          </ScrollReveal>
        </div>
      </section>

      {/* Included Capabilities Section */}
      <section className="py-40 px-8 bg-[#0A0A0A]/30 border-y border-white/[0.04]">
        <div className="max-w-7xl mx-auto">
          <ScrollReveal>
            <div className="mb-20 text-center">
              <span className="font-mono text-[11px] tracking-widest text-[#555555] uppercase">Operational Unlock</span>
              <h2 className="text-4xl md:text-5xl font-light tracking-tight mt-4 text-[#ededed]">What OrbitOS pricing unlocks</h2>
            </div>
          </ScrollReveal>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
            {[
              { icon: Target, title: "Project Control", desc: "Granular oversight of every active workstream without the overhead of manual tracking." },
              { icon: Shield, title: "Member Visibility", desc: "Know who is carrying the load and where the friction points are in real-time." },
              { icon: Zap, title: "Delivery Rhythm", desc: "Automated triggers keep your delivery cadence consistent, preventing project drift." },
              { icon: Layers, title: "Execution Structure", desc: "A deterministic framework for how work moves from concept to delivery." },
              { icon: Target, title: "Owner Oversight", desc: "Exit the day-to-day management while maintaining total awareness of studio health." },
              { icon: Shield, title: "Architectural Integrity", desc: "Ensuring your studio operations scale without compromising on craft or quality." }
            ].map((item, i) => (
              <ScrollReveal key={i} delay={i * 50}>
                <div className="flex gap-6">
                  <div className="flex-none pt-1">
                    <item.icon className="w-6 h-6 text-[#ededed]/40" />
                  </div>
                  <div>
                    <h4 className="text-lg font-light text-[#ededed] mb-2">{item.title}</h4>
                    <p className="text-[#888888] text-sm leading-relaxed font-light">{item.desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="py-40 px-8 max-w-7xl mx-auto">
        <ScrollReveal>
          <div className="mb-16">
            <h2 className="text-4xl font-light tracking-tight text-[#ededed]">Tier Comparison</h2>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={100}>
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  <th className="py-6 font-mono text-[10px] tracking-widest text-[#555555] uppercase">Capabilities</th>
                  <th className="py-6 font-mono text-[10px] tracking-widest text-[#555555] uppercase w-1/5">Free</th>
                  <th className="py-6 font-mono text-[10px] tracking-widest text-[#555555] uppercase w-1/5">Starter</th>
                  <th className="py-6 font-mono text-[10px] tracking-widest text-[#555555] uppercase w-1/5 text-[#ededed]">Team</th>
                  <th className="py-6 font-mono text-[10px] tracking-widest text-[#555555] uppercase w-1/5">Growth</th>
                </tr>
              </thead>
              <tbody className="text-sm font-light text-[#888888]">
                {[
                  { label: "Owners Included", values: ["1", "1", "3", "5"] },
                  { label: "Members Included", values: ["2", "5", "10", "Unlimited"] },
                  { label: "Active Projects", values: ["Limited", "5", "10", "Premium"] },
                  { label: "Visibility & Insights", values: ["Basic", "Core", "Full", "Intelligence"] },
                  { label: "Support Level", values: ["Community", "Standard", "Priority", "Premium"] }
                ].map((row, i) => (
                  <tr key={i} className="border-b border-white/[0.04] group hover:bg-white/[0.01] transition-colors">
                    <td className="py-6 text-[#ededed]/70">{row.label}</td>
                    {row.values.map((val, j) => (
                      <td key={j} className={cn("py-6", j === 2 && "text-[#ededed] font-medium")}>{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollReveal>
      </section>

      {/* FAQ Section */}
      <section className="py-32 px-8 bg-[#0A0A0A]/50 border-y border-white/[0.04]">
        <div className="max-w-3xl mx-auto">
          <ScrollReveal>
            <h2 className="text-3xl font-light tracking-tight text-[#ededed] mb-12 text-center">Frequently Asked Questions</h2>
          </ScrollReveal>
          <div className="space-y-12">
            {[
              { q: "How are workspaces structured?", a: "Plans are structured by workspace capacity. Each tier includes a specific member and owner cap tailored to different studio scales." },
              { q: "Can I move between tiers?", a: "Yes. Larger teams can move to higher tiers as they grow, ensuring their operational infrastructure scales with their output." },
              { q: "Is OrbitOS built for agencies only?", a: "While we specialize in digital agencies and studios, any team that requires high-precision project movement can benefit from OrbitOS." },
              { q: "What happens if we reach our project limit?", a: "OrbitOS is designed to grow with you. When your studio reaches its active capacity, you can transition to a higher tier for expanded throughput." },
              { q: "Is there a long-term commitment?", a: "No. OrbitOS is billed on a month-to-month basis. We believe our operational leverage should earn your trust every single month." }
            ].map((faq, i) => (
              <ScrollReveal key={i} delay={i * 50}>
                <div>
                  <h4 className="text-lg font-light text-[#ededed] mb-3">{faq.q}</h4>
                  <p className="text-[#888888] text-sm leading-relaxed font-light">{faq.a}</p>
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
            <h2 className="text-4xl md:text-6xl font-light tracking-tight mb-8 text-[#ededed]">Ready to exit the chaos?</h2>
            <p className="text-lg text-[#888888] font-light mb-12 max-w-xl mx-auto">
              Join over 400 world-class studios using OrbitOS to run their operations with surgical precision.
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <Link href="/signup" className="inline-block bg-[#ededed] text-[#050505] px-10 py-4 rounded-xl font-medium text-[15px] hover:bg-white hover:-translate-y-[2px] transition-all duration-300">
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

// Minimal utility function for conditional classes
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
