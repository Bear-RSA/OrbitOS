import Link from 'next/link';
import type { Metadata } from 'next';
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

export const metadata: Metadata = {
  title: "Terms of Service · OrbitOS",
  description: "The legal framework for using our operational workspace platform.",
};

export default function TermsPage() {
  return (
    <main className="theme-dark min-h-screen bg-[#050505] text-[#ededed] font-sans selection:bg-white/[0.1]">
      <MarketingNav />

      {/* Hero Section */}
      <section className="pt-48 pb-20 px-8 max-w-7xl mx-auto">
        <ScrollReveal className="flex flex-col items-center text-center">
          <span className="font-mono text-[10px] tracking-[0.3em] text-[#555555] uppercase mb-8 block">Operational Contract</span>
          <h1 className="text-5xl md:text-[5.5rem] font-light tracking-tighter leading-[0.95] mb-8 text-[#ededed]">
            Terms of Service
          </h1>
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-white/[0.2] to-transparent"></div>
          <p className="mt-8 font-mono text-[10px] tracking-widest text-[#555555] uppercase">Last Updated: July 2026</p>
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
              <h2 className="text-2xl mb-6">3. User Accounts &amp; Security</h2>
              <p>
                To use the Service, you must register for an account using a valid email address and provide accurate, current, and complete information. You are responsible for maintaining the confidentiality of your account credentials. Notify us immediately of any unauthorized access.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">4. Workspace Ownership &amp; Control</h2>
              <p>
                The Service operates on a workspace model where each workspace has one Owner with full administrative control. Members are invited by Owners and access data according to permissions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">5. Subscription Plans and Billing</h2>
              <p className="mb-4">We offer tiered monthly subscriptions enforced by server-side quota limits:</p>
              <ul className="list-disc list-inside space-y-2 mb-4">
                <li>Exploration (Free): R0/month</li>
                <li>Foundational (Starter): R299/month</li>
                <li>Studio Core (Team): R699/month</li>
                <li>Total Visibility (Growth): R1,499/month</li>
              </ul>
              <p>Payments are processed securely via Payfast.</p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">6. Delivery Policy</h2>
              <p>
                OrbitOS is a digital SaaS product; therefore, service delivery is immediate and fully automated. Upon successful payment processing via Payfast, our backend infrastructure instantly upgrades the organization&apos;s database tier, granting immediate access to new seat limits and project capacities.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">7. Cancellation Policy</h2>
              <p>
                Workspace Owners may cancel their OrbitOS subscription at any time through the billing panel. Upon cancellation, the workspace will not be immediately downgraded. The organization retains full access to its premium features until the conclusion of the active billing cycle, after which it will revert to the free Exploration tier limits.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">8. Refund Policy</h2>
              <p>
                All subscription payments processed via Payfast are strictly non-refundable. OrbitOS does not provide prorated refunds, credits, or partial reimbursements for mid-cycle cancellations, unused seats, or downgraded accounts. If a technical billing error occurs, the Owner must contact support within 7 days of the transaction for review.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">9. Data Ownership &amp; System Telemetry</h2>
              <p>
                You retain ownership of User Content, granting us a limited license to process and display it solely for providing the Service. OrbitOS operates as a live environment. By using the platform, users agree that operational activities (e.g., file ingestion and task execution) are actively logged and broadcasted to project members via the real-time Command Center telemetry stream. All uploaded assets are protected via secure, signed upload flows.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">10. Third-Party Services</h2>
              <p>
                The Service relies on third-party providers including Firebase (Google), Vercel, Resend, Upstash, Cloudinary, and Payfast. Your use of OrbitOS is subject to their respective terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">11. User Responsibilities</h2>
              <p>
                You agree to use the Service only for lawful purposes. Prohibited activities include attempting unauthorized access, transmitting malware, or engaging in data mining.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">12. Service Availability &amp; Warranties</h2>
              <p className="mb-4">
                We do not guarantee that the Service will be available at all times.
              </p>
              <p className="uppercase text-[13px] tracking-wide">
                THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">13. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by law, Miraistack (Pty) Ltd shall not be liable for any indirect, incidental, or consequential damages resulting from your use of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-6">14. Governing Law &amp; Contact</h2>
              <p className="mb-12">
                These Terms shall be governed by and construed in accordance with the laws of the Republic of South Africa. You submit to the exclusive jurisdiction of the courts in Johannesburg, Gauteng.
              </p>
              <div className="pt-20 border-t border-white/[0.04]">
                <div className="bg-[#0A0A0A] p-10 rounded-2xl ring-1 ring-white/[0.04]">
                  <h2 className="text-xl mb-4">Contact Information</h2>
                  <p className="text-sm mb-6">For questions, please contact us at:</p>
                  <Link href="mailto:feedback@miraistack.co.za" className="text-[#ededed] font-medium hover:underline">feedback@miraistack.co.za</Link>
                </div>
              </div>
            </section>
          </div>

        </ScrollReveal>
      </section>

      <MarketingFooter />
    </main>
  );
}
