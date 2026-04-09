import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { ScrollReveal } from "@/components/ui/scroll-reveal";

export const metadata: Metadata = {
  title: "Terms of Service · OrbitOS",
  description: "The legal framework for using our operational workspace platform.",
};

export default function TermsPage() {
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
          <span className="font-mono text-[10px] tracking-[0.3em] text-[#555555] uppercase mb-8 block">Operational Contract</span>
          <h1 className="text-5xl md:text-[5.5rem] font-light tracking-tighter leading-[0.95] mb-8 text-[#ededed]">
            Terms of Service
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
              <h2 className="text-2xl mb-6">1. Acceptance of Terms</h2>
              <p>
                By accessing or using OrbitOS (&quot;Service&quot;), operated by Miraistack (Pty) Ltd (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, you may not access or use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">2. Description of Service</h2>
              <p>
                OrbitOS is a cloud-based workspace platform designed for small teams and digital agencies. The Service provides tools for task management, project collaboration, team coordination, and dashboard analytics.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">3. User Accounts</h2>
              <div className="mt-8 space-y-8">
                <div>
                  <h3 className="text-lg mb-4 text-[#ededed]/80">3.1 Registration</h3>
                  <p className="text-sm">To use the Service, you must register for an account using a valid email address. You must provide accurate, current, and complete information.</p>
                </div>
                <div>
                  <h3 className="text-lg mb-4 text-[#ededed]/80">3.2 Account Security</h3>
                  <p className="text-sm">You are responsible for maintaining the confidentiality of your account credentials. Notify us immediately of any unauthorized access.</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl mb-6">4. Workspace Ownership & Control</h2>
              <p>
                The Service operates on a workspace model where each workspace has one Owner with full administrative control. Members are invited by Owners and access data according to permissions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">5. User Responsibilities</h2>
              <p>
                You agree to use the Service only for lawful purposes. Prohibited activities include attempting unauthorized access, transmitting malware, or engaging in data mining.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">6. Data & Content Ownership</h2>
              <p>
                You retain ownership of User Content. By using the Service, you grant us a limited license to process and display your content solely for providing the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">7. Third-Party Services</h2>
              <p>The Service relies on third-party providers including Firebase (Google), Vercel, Resend, and Upstash. Your use of OrbitOS is subject to their respective terms.</p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">8. Service Availability</h2>
              <p>
                We do not guarantee that the Service will be available at all times. The Service may be unavailable due to maintenance or factor beyond our control.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">9. Disclaimer of Warranties</h2>
              <p className="uppercase text-[13px] tracking-wide">
                THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">10. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by law, Miraistack (Pty) Ltd shall not be liable for any indirect, incidental, or consequential damages resulting from your use of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">11. Governing Law</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the Republic of South Africa. You submit to the exclusive jurisdiction of the courts in Johannesburg, Gauteng.
              </p>
            </section>

            <section className="pt-20 border-t border-white/[0.04]">
              <div className="bg-[#0A0A0A] p-10 rounded-2xl ring-1 ring-white/[0.04]">
                <h2 className="text-xl mb-4">Contact Information</h2>
                <p className="text-sm mb-6">For questions regarding these terms, please contact us at:</p>
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
            <Link className="font-mono text-[10px] tracking-widest uppercase text-[#ededed] transition-colors" href="/terms">Terms</Link>
            <Link className="font-mono text-[10px] tracking-widest uppercase text-[#555555] hover:text-[#ededed] transition-colors" href="/security">Security</Link>
            <Link className="font-mono text-[10px] tracking-widest uppercase text-[#555555] hover:text-[#ededed] transition-colors" href="https://github.com/MiraiStack">GitHub</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
