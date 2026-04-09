import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { ScrollReveal } from "@/components/ui/scroll-reveal";

export const metadata: Metadata = {
  title: "Security · OrbitOS",
  description: "Our comprehensive framework for protecting your operational data and platform integrity.",
};

export default function SecurityPage() {
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
          <span className="font-mono text-[10px] tracking-[0.3em] text-[#555555] uppercase mb-8 block">Operational Integrity</span>
          <h1 className="text-5xl md:text-[5.5rem] font-light tracking-tighter leading-[0.95] mb-8 text-[#ededed]">
            Security
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
              <h2 className="text-2xl mb-6">Overview</h2>
              <p>
                Security is foundational to OrbitOS. As a workspace platform trusted by teams to manage critical projects and sensitive business data, we treat the protection of your information with the seriousness it deserves.
              </p>
              <p className="mt-4">
                We believe security is not a feature but a baseline requirement. Our approach combines robust infrastructure, strict access controls, and continuous vigilance—without compromising usability.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">Data Protection</h2>
              <div className="mt-8 space-y-8">
                <div>
                  <h3 className="text-lg mb-4 text-[#ededed]/80">Encryption in Transit</h3>
                  <p className="text-sm">All data transmitted between your device and our servers is protected using TLS 1.2 or higher. We enforce HTTPS across all endpoints.</p>
                </div>
                <div>
                  <h3 className="text-lg mb-4 text-[#ededed]/80">Encryption at Rest</h3>
                  <p className="text-sm">Your data is stored in Firebase (Google Cloud Platform), which provides enterprise-grade encryption at rest using AES-256.</p>
                </div>
                <div>
                  <h3 className="text-lg mb-4 text-[#ededed]/80">Data Minimization</h3>
                  <p className="text-sm">We collect only necessary information. We do not sell your data or use it for advertising. Deleted accounts result in permanent removal of personal data within 30 days.</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl mb-6">Authentication & Access Control</h2>
              <div className="mt-8 space-y-8">
                <div>
                  <h3 className="text-lg mb-4 text-[#ededed]/80">Secure Authentication</h3>
                  <p className="text-sm">We use Firebase Authentication, implementing industry-standard password hashing (bcrypt), secure token management, and brute-force protection.</p>
                </div>
                <div>
                  <h3 className="text-lg mb-4 text-[#ededed]/80">Role-Based Access Control (RBAC)</h3>
                  <p className="text-sm">Strict permission boundaries ensure Owners have full control while Members operate within defined limits. Data isolation prevents cross-workspace access.</p>
                </div>
                <div>
                  <h3 className="text-lg mb-4 text-[#ededed]/80">Session Security</h3>
                  <p className="text-sm">Managed via secure, HTTP-only cookies with automatic expiration and immediate session revocation capabilities.</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl mb-6">Infrastructure Security</h2>
              <p>Our application is hosted on Vercel and Google Cloud Platform, benefiting from world-class physical and network security controls, 24/7 monitoring, and redundant backup systems.</p>
              
              <div className="overflow-x-auto mt-8">
                <table className="w-full text-left text-sm font-light border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.04]">
                      <th className="py-4 text-[#ededed]/60 font-medium">Provider</th>
                      <th className="py-4 text-[#ededed]/60 font-medium">Service</th>
                      <th className="py-4 text-[#ededed]/60 font-medium">Security Standards</th>
                    </tr>
                  </thead>
                  <tbody className="text-[#888888]">
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-4 text-[#ededed]">Firebase</td>
                      <td className="py-4">Database & Auth</td>
                      <td className="py-4">Google Cloud Infrastructure, AES-256</td>
                    </tr>
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-4 text-[#ededed]">Vercel</td>
                      <td className="py-4">Hosting & CDN</td>
                      <td className="py-4">SOC 2 Type 2, DDoS mitigation</td>
                    </tr>
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-4 text-[#ededed]">Upstash</td>
                      <td className="py-4">Rate Limiting</td>
                      <td className="py-4">Encrypted Redis protocols</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-2xl mb-6">Application Security</h2>
              <ul className="mt-4 space-y-4 list-none p-0">
                <li className="flex gap-4">
                  <span className="text-[#ededed] font-medium min-w-[140px]">Validation:</span>
                  <span className="text-[#888888] font-light leading-relaxed">Strict input sanitization to prevent XSS and injection attacks.</span>
                </li>
                <li className="flex gap-4">
                  <span className="text-[#ededed] font-medium min-w-[140px]">Rate Limiting:</span>
                  <span className="text-[#888888] font-light leading-relaxed">Intelligent abuse prevention via Upstash Redis.</span>
                </li>
                <li className="flex gap-4">
                  <span className="text-[#ededed] font-medium min-w-[140px]">Headers:</span>
                  <span className="text-[#888888] font-light leading-relaxed">Implementation of CSP, HSTS, and X-Frame-Options.</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl mb-6">Responsible Disclosure</h2>
              <p>We take security vulnerabilities seriously and welcome reporting from security researchers.</p>
              <div className="mt-8 bg-[#0A0A0A] p-10 rounded-2xl ring-1 ring-white/[0.04]">
                <h3 className="text-lg mb-4 text-[#ededed]">Report a Vulnerability</h3>
                <p className="text-sm text-[#888888] mb-6 font-light">
                  If you discover a security issue, please contact us immediately. We commit to acknowledging receipt within 48 hours.
                </p>
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
            <Link className="font-mono text-[10px] tracking-widest uppercase text-[#555555] hover:text-[#ededed] transition-colors" href="/privacy">Privacy</Link>
            <Link className="font-mono text-[10px] tracking-widest uppercase text-[#555555] hover:text-[#ededed] transition-colors" href="/terms">Terms</Link>
            <Link className="font-mono text-[10px] tracking-widest uppercase text-[#ededed] transition-colors" href="/security">Security</Link>
            <Link className="font-mono text-[10px] tracking-widest uppercase text-[#555555] hover:text-[#ededed] transition-colors" href="https://github.com/MiraiStack">GitHub</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
