import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { ScrollReveal } from "@/components/ui/scroll-reveal";

export const metadata: Metadata = {
  title: "Privacy Policy · OrbitOS",
  description: "How we protect your operational intelligence and personal information.",
};

export default function PrivacyPage() {
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
            <Link className="font-sans tracking-tight font-light text-[#888888] hover:text-[#ededed] transition-colors duration-300" href="/#features">Features</Link>
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
      <section className="pt-48 pb-20 px-8 max-w-7xl mx-auto">
        <ScrollReveal className="flex flex-col items-center text-center">
          <span className="font-mono text-[10px] tracking-[0.3em] text-[#555555] uppercase mb-8 block">Legal Protocol</span>
          <h1 className="text-5xl md:text-[5.5rem] font-light tracking-tighter leading-[0.95] mb-8 text-[#ededed]">
            Privacy Policy
          </h1>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-white/[0.2] to-transparent"></div>
          <p className="mt-8 font-mono text-[10px] tracking-widest text-[#555555] uppercase">Last Updated: April 2026</p>
        </ScrollReveal>
      </section>

      {/* Content Section */}
      <section className="pb-40 px-8 max-w-4xl mx-auto">
        <ScrollReveal delay={100} className="prose prose-invert prose-p:text-[#888888] prose-p:font-light prose-p:leading-relaxed prose-headings:font-light prose-headings:tracking-tight prose-headings:text-[#ededed] prose-strong:text-[#ededed] prose-strong:font-medium max-w-none">

          <div className="space-y-16">
            <section>
              <h2 className="text-2xl mb-6">1. Introduction</h2>
              <p>
                OrbitOS (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our SaaS workspace platform (&quot;Service&quot;).
              </p>
              <p className="mt-4">
                This Policy is governed by the Protection of Personal Information Act 4 of 2013 (&quot;POPIA&quot;) of South Africa. By accessing or using OrbitOS, you consent to the practices described in this Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">2. Definitions</h2>
              <ul className="space-y-4 list-none p-0">
                <li className="flex gap-4">
                  <span className="text-[#ededed] font-medium min-w-[120px]">POPIA:</span>
                  <span className="text-[#888888] font-light leading-relaxed">The Protection of Personal Information Act 4 of 2013.</span>
                </li>
                <li className="flex gap-4">
                  <span className="text-[#ededed] font-medium min-w-[120px]">Data Subject:</span>
                  <span className="text-[#888888] font-light leading-relaxed">An individual who accesses or uses the Service.</span>
                </li>
                <li className="flex gap-4">
                  <span className="text-[#ededed] font-medium min-w-[120px]">Workspace:</span>
                  <span className="text-[#888888] font-light leading-relaxed">The organizational environment created within OrbitOS.</span>
                </li>
                <li className="flex gap-4">
                  <span className="text-[#ededed] font-medium min-w-[120px]">Processing:</span>
                  <span className="text-[#888888] font-light leading-relaxed">Any operation or activity concerning Personal Information, as defined in POPIA.</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl mb-6">3. Information We Collect</h2>
              <p>We collect only the Personal Information necessary to provide our Service, in accordance with the data minimization principle under POPIA.</p>

              <div className="mt-8 space-y-8">
                <div>
                  <h3 className="text-lg mb-4 text-[#ededed]/80">3.1 Account Information</h3>
                  <p className="text-sm">Full name, email address, role designation (Owner or Member), and workspace association.</p>
                </div>
                <div>
                  <h3 className="text-lg mb-4 text-[#ededed]/80">3.2 Usage Data</h3>
                  <p className="text-sm">Tasks and projects created, modified, or assigned; activity timestamps and audit logs; workspace interactions and collaborations; user-generated content within the platform.</p>
                </div>
                <div>
                  <h3 className="text-lg mb-4 text-[#ededed]/80">3.3 Technical Information</h3>
                  <p className="text-sm">IP address (collected for security and abuse prevention), browser type, device information, operating system, and access times.</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl mb-6">4. Purpose and Legal Basis</h2>
              <p>We process Personal Information only for specific, explicitly defined purposes and where we have a lawful basis under POPIA.</p>

              <div className="mt-8 space-y-8">
                <div>
                  <h3 className="text-lg mb-4 text-[#ededed]/80">4.1 Purposes of Processing</h3>
                  <p className="text-sm">To provide and maintain the Service; to authenticate users and secure accounts; to facilitate workspace collaboration; to send transactional communications; to improve platform functionality; and to comply with legal obligations.</p>
                </div>
                <div>
                  <h3 className="text-lg mb-4 text-[#ededed]/80">4.2 Lawful Basis</h3>
                  <p className="text-sm">Our processing is based on Consent, Contractual Necessity, Legitimate Interest (for security and improvement), and Legal Obligation.</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl mb-6">5. How We Share Information</h2>
              <div className="mt-8 space-y-8">
                <div>
                  <h3 className="text-lg mb-4 text-[#ededed]/80">5.1 Within Your Organization</h3>
                  <p className="text-sm">Workspace Owners and Members can see your name, email, associated tasks, and activity within the shared Workspace.</p>
                </div>
                <div>
                  <h3 className="text-lg mb-4 text-[#ededed]/80">5.2 Third-Party Service Providers</h3>
                  <div className="overflow-x-auto mt-6">
                    <table className="w-full text-left text-sm font-light border-collapse">
                      <thead>
                        <tr className="border-b border-white/[0.04]">
                          <th className="py-4 text-[#ededed]/60 font-medium">Provider</th>
                          <th className="py-4 text-[#ededed]/60 font-medium">Purpose</th>
                          <th className="py-4 text-[#ededed]/60 font-medium">Location</th>
                        </tr>
                      </thead>
                      <tbody className="text-[#888888]">
                        <tr className="border-b border-white/[0.04]">
                          <td className="py-4">Firebase (Google)</td>
                          <td className="py-4">Auth & Database</td>
                          <td className="py-4">USA</td>
                        </tr>
                        <tr className="border-b border-white/[0.04]">
                          <td className="py-4">Vercel</td>
                          <td className="py-4">Hosting & Infrastructure</td>
                          <td className="py-4">USA</td>
                        </tr>
                        <tr className="border-b border-white/[0.04]">
                          <td className="py-4">Resend</td>
                          <td className="py-4">Transactional Email</td>
                          <td className="py-4">USA</td>
                        </tr>
                        <tr className="border-b border-white/[0.04]">
                          <td className="py-4">Upstash</td>
                          <td className="py-4">Security & Rate Limiting</td>
                          <td className="py-4">United States</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl mb-6">6. Data Security</h2>
              <p>We implement appropriate technical and organizational measures to safeguard Personal Information against loss, unauthorized access, or disclosure:</p>
              <ul className="mt-4 space-y-2 list-disc list-inside text-[#888888] font-light">
                <li>Encryption in transit (TLS/SSL) and at rest</li>
                <li>Role-based access controls (RBAC)</li>
                <li>Secure authentication via Firebase</li>
                <li>Regular security assessments and monitoring</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl mb-6">7. Data Retention</h2>
              <p>
                We retain Personal Information only for as long as necessary to fulfill the purposes for which it was collected. Upon account deletion, we will delete or anonymize your information within 30 days, except where retention is required for legal obligations.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">8. Your Rights Under POPIA</h2>
              <p>As a Data Subject, you have the right to access, correct, delete, or object to the processing of your Personal Information. You also have the right to withdraw consent and to lodge a complaint with the Information Regulator of South Africa.</p>
              <p className="mt-4">
                To exercise these rights, email <span className="text-[#ededed]">feedback@miraistack.co.za</span>.
              </p>
            </section>

            <section className="pt-20 border-t border-white/[0.04]">
              <div className="bg-[#0A0A0A] p-10 rounded-2xl ring-1 ring-white/[0.04]">
                <h2 className="text-xl mb-4">Contact Information</h2>
                <p className="text-sm mb-6">For questions regarding this policy, please contact our Information Officer: Mirai Stack (Pty) Ltd</p>
                <Link href="mailto:feedback@miraistack.co.za" className="text-[#ededed] font-medium hover:underline">feedback@miraistack.co.za</Link>
              </div>
            </section>
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
            <Link className="font-mono text-[10px] tracking-widest uppercase text-[#ededed] transition-colors" href="/privacy">Privacy</Link>
            <Link className="font-mono text-[10px] tracking-widest uppercase text-[#555555] hover:text-[#ededed] transition-colors" href="/terms">Terms</Link>
            <Link className="font-mono text-[10px] tracking-widest uppercase text-[#555555] hover:text-[#ededed] transition-colors" href="/security">Security</Link>
            <Link className="font-mono text-[10px] tracking-widest uppercase text-[#555555] hover:text-[#ededed] transition-colors" href="https://github.com/MiraiStack">GitHub</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
