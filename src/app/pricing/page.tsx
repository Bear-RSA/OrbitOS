import Link from 'next/link';
import { CheckCircle2, Shield, Zap, Target, Layers } from 'lucide-react';
import type { Metadata } from 'next';
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Eyebrow } from "@/components/marketing/brand";

export const metadata: Metadata = {
  title: "Pricing · OrbitOS",
  description: "Flexible operational leverage for teams of all sizes.",
};

export default function PricingPage() {
  return (
    <main className="theme-dark min-h-screen bg-transparent text-ink font-sans selection:bg-orbit-amber/25">
      <MarketingNav active="pricing" />

      {/* Hero Section */}
      <section className="pt-48 pb-32 px-8 max-w-7xl mx-auto">
        <ScrollReveal className="flex flex-col items-center text-center">
          <Eyebrow className="mb-8">Operational Scale</Eyebrow>
          <h1 className="text-5xl md:text-[5.5rem] font-light tracking-tighter leading-[0.95] mb-8 max-w-4xl text-ink">
            Pricing
          </h1>
          <p className="text-xl md:text-2xl text-ink-muted mx-auto max-w-2xl leading-relaxed font-light mb-12">
            OrbitOS is an operating system for disciplined teams. Choose the tier that matches your studio&apos;s output and operational complexity.
          </p>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-white/[0.2] to-transparent"></div>
        </ScrollReveal>
      </section>

      {/* Pricing Tiers */}
      <section className="py-20 px-6 md:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Free */}
          <ScrollReveal delay={100}>
            <InteractiveCard className="p-8 xl:p-10 h-full flex flex-col border border-white/[0.02]">
              <div className="mb-8">
                <span className="text-[12px] text-ink-dim">Solo</span>
                <h3 className="text-2xl font-light text-ink mt-2 mb-4 tracking-tight">Free</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-light text-ink">R0</span>
                  <span className="text-ink-dim font-light text-sm">/mo</span>
                </div>
                <p className="text-ink-muted text-sm mt-4 font-light leading-relaxed">For testing OrbitOS with a very small team.</p>
              </div>
              <ul className="space-y-4 mb-12 flex-grow">
                {[
                  '1 owner + 2 members',
                  '3 active projects',
                  'Calls with 2 people',
                  '100 MB vault',
                  '100 chat images a month',
                  'Task reminders by email'
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-ink/50 font-light">
                    <CheckCircle2 className="w-4 h-4 text-ink/20" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="block w-full py-4 rounded-xl border border-white/[0.04] bg-surface-raised text-ink text-center text-sm font-medium hover:bg-surface-control transition-all duration-300">
                Get Started
              </Link>
            </InteractiveCard>
          </ScrollReveal>

          {/* Starter */}
          <ScrollReveal delay={200}>
            <InteractiveCard className="p-8 xl:p-10 h-full flex flex-col border border-white/[0.02]">
              <div className="mb-8">
                <span className="text-[12px] text-ink-dim">Small teams</span>
                <h3 className="text-2xl font-light text-ink mt-2 mb-4 tracking-tight">Standard</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-light text-ink">R299</span>
                  <span className="text-ink-dim font-light text-sm">/mo</span>
                </div>
                <p className="text-ink-muted text-sm mt-4 font-light leading-relaxed">For small teams building structure and discipline.</p>
              </div>
              <ul className="space-y-4 mb-12 flex-grow">
                {[
                  '1 owner + 5 members',
                  '5 active projects',
                  'Calls with up to 4 people',
                  '3 client guests per meeting',
                  '20 call transcripts a month',
                  '1 GB vault'
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-ink/70 font-light">
                    <CheckCircle2 className="w-4 h-4 text-ink/30" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="block w-full py-4 rounded-xl border border-white/[0.04] bg-surface-raised text-ink text-center text-sm font-medium hover:bg-surface-control transition-all duration-300">
                Get Started
              </Link>
            </InteractiveCard>
          </ScrollReveal>

          {/* Team - Primary Plan */}
          <ScrollReveal delay={300}>
            <InteractiveCard className="p-8 xl:p-10 h-full flex flex-col ring-1 ring-white/[0.1] bg-surface-card relative border border-white/[0.05]">
              <div className="mb-8">
                {/* Inline with the tier label rather than pinned to the card
                    edge: the card clips its own corners, so a pinned badge
                    landed on top of the label instead of above the card. */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-ink">Studios</span>
                  <span className="bg-ink text-on-ink text-[12px] px-3 py-1 rounded-full font-semibold">Recommended</span>
                </div>
                <h3 className="text-2xl font-light text-ink mt-2 mb-4 tracking-tight">Pro</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-light text-ink">R699</span>
                  <span className="text-ink-dim font-light text-sm">/mo</span>
                </div>
                <p className="text-ink-muted text-sm mt-4 font-light leading-relaxed">For active agencies running delivery with clarity.</p>
              </div>
              <ul className="space-y-4 mb-12 flex-grow">
                {[
                  '3 owners + 15 members',
                  '25 active projects',
                  'Calls with up to 10 people',
                  '5 outside guests per call',
                  '100 call transcripts a month',
                  '5 GB vault'
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-ink font-light">
                    <CheckCircle2 className="w-4 h-4 text-ink/60" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="block w-full py-4 rounded-xl bg-ink text-on-ink text-center text-sm font-medium hover:bg-white hover:-translate-y-[2px] transition-all duration-300 shadow-[0_0_40px_rgba(255,255,255,0.05)]">
                Get Started
              </Link>
            </InteractiveCard>
          </ScrollReveal>

          {/* Growth */}
          <ScrollReveal delay={400}>
            <InteractiveCard className="p-8 xl:p-10 h-full flex flex-col border border-white/[0.02]">
              <div className="mb-8">
                <span className="text-[12px] text-ink-dim">Larger studios</span>
                <h3 className="text-2xl font-light text-ink mt-2 mb-4 tracking-tight">Custom</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-light text-ink">Let&apos;s talk</span>
                </div>
                <p className="text-ink-muted text-sm mt-4 font-light leading-relaxed">For studios of 16 or more. Priced to your team.</p>
              </div>
              <ul className="space-y-4 mb-12 flex-grow">
                {[
                  '5 owners + 16 or more members',
                  'Project count set to your studio',
                  'Calls with up to 12 people',
                  'Vault up to 20 GB',
                  'Up to 500 call transcripts a month',
                  'Annual invoice, paid by EFT'
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-ink/70 font-light">
                    <CheckCircle2 className="w-4 h-4 text-ink/30" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/contact-sales" className="block w-full py-4 rounded-xl border border-white/[0.04] bg-surface-raised text-ink text-center text-sm font-medium hover:bg-surface-control transition-all duration-300">
                Contact Sales
              </Link>
            </InteractiveCard>
          </ScrollReveal>
        </div>
      </section>

      {/* Included Capabilities Section */}
      <section className="py-40 px-8 bg-surface-card/30 border-y border-white/[0.04]">
        <div className="max-w-7xl mx-auto">
          <ScrollReveal>
            <div className="mb-20 text-center">
              <Eyebrow index="01">Operational Unlock</Eyebrow>
              <h2 className="text-4xl md:text-5xl font-light tracking-tight mt-4 text-ink">What OrbitOS pricing unlocks</h2>
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
                    <item.icon className="w-6 h-6 text-ink/40" />
                  </div>
                  <div>
                    <h4 className="text-lg font-light text-ink mb-2">{item.title}</h4>
                    <p className="text-ink-muted text-sm leading-relaxed font-light">{item.desc}</p>
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
            <h2 className="text-4xl font-light tracking-tight text-ink">Tier Comparison</h2>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={100}>
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  <th className="py-6 text-[12px] text-ink-dim">Capabilities</th>
                  <th className="py-6 text-[12px] text-ink-dim w-1/5">Free</th>
                  <th className="py-6 text-[12px] text-ink-dim w-1/5">Standard</th>
                  <th className="py-6 text-[12px] text-ink-dim w-1/5 text-ink">Pro</th>
                  <th className="py-6 text-[12px] text-ink-dim w-1/5">Custom</th>
                </tr>
              </thead>
              <tbody className="text-sm font-light text-ink-muted">
                {[
                  { label: "Price", values: ["R0", "R299/mo", "R699/mo", "Contact sales"] },
                  { label: "Owners", values: ["1", "1", "3", "5"] },
                  { label: "Members", values: ["2", "5", "15", "16+"] },
                  { label: "Active projects", values: ["3", "5", "25", "Agreed"] },
                  { label: "People per call", values: ["2", "4", "10", "Up to 12"] },
                  { label: "Outside guests per call", values: ["None", "None", "5", "Agreed"] },
                  { label: "Client guests per meeting", values: ["None", "3", "10", "Agreed"] },
                  { label: "Call transcripts a month", values: ["None", "20", "100", "Up to 500"] },
                  { label: "Vault storage", values: ["100 MB", "1 GB", "5 GB", "Up to 20 GB"] },
                  { label: "Vault documents", values: ["25", "200", "1,000", "Up to 2,000"] },
                  { label: "Chat images a month", values: ["100", "1,000", "3,000", "3,000"] }
                ].map((row, i) => (
                  <tr key={i} className="border-b border-white/[0.04] group hover:bg-white/[0.01] transition-colors">
                    <td className="py-6 text-ink/70">{row.label}</td>
                    {row.values.map((val, j) => (
                      <td key={j} className={cn("py-6", j === 2 && "text-ink font-medium")}>{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollReveal>
      </section>

      {/* FAQ Section */}
      <section className="py-32 px-8 bg-surface-card/50 border-y border-white/[0.04]">
        <div className="max-w-3xl mx-auto">
          <ScrollReveal>
            <h2 className="text-3xl font-light tracking-tight text-ink mb-12 text-center">Frequently Asked Questions</h2>
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
                  <h4 className="text-lg font-light text-ink mb-3">{faq.q}</h4>
                  <p className="text-ink-muted text-sm leading-relaxed font-light">{faq.a}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-8">
        <ScrollReveal>
          <div className="max-w-5xl mx-auto rounded-[32px] bg-surface-card p-16 md:p-24 text-center ring-1 ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-32 bg-gradient-to-b from-ink/30 to-transparent"></div>
            <h2 className="text-4xl md:text-6xl font-light tracking-tight mb-8 text-ink">Ready to exit the chaos?</h2>
            <p className="text-lg text-ink-muted font-light mb-12 max-w-xl mx-auto">
              Free for teams of three. No card needed, billed in rand when you grow.
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <Link href="/signup" className="inline-block bg-ink text-on-ink px-10 py-4 rounded-xl font-medium text-[15px] hover:bg-white hover:-translate-y-[2px] transition-all duration-300">
                Get Started
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </section>

      <MarketingFooter />
    </main>
  );
}

// Minimal utility function for conditional classes
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
