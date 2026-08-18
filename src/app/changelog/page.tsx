import Link from 'next/link';
import type { Metadata } from 'next';
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

export const metadata: Metadata = {
  title: "Changelog · OrbitOS",
  description: "A record of how OrbitOS is evolving — one release at a time.",
};

export default function ChangelogPage() {
  const releases = [
    {
      month: "August 2026",
      entries: [
        {
          title: "Operational Tiers & Billing",
          desc: "Introduced four subscription tiers with per-tier resource limits enforced at the server boundary. Integrated PayFast checkout with a signed webhook for subscription state reconciliation."
        },
        {
          title: "Calendar Feed Subscriptions",
          desc: "Personal calendar feeds now publish over a signed, revocable token to any iCalendar client. Feed URLs are generated per operator and can be rotated without disturbing workspace state."
        },
        {
          title: "Availability Resolution Engine",
          desc: "Implemented free/busy computation and open-slot discovery across workspace personnel, giving scheduling a deterministic source of truth."
        },
        {
          title: "Event Management System",
          desc: "Deployed the project calendar with day, week, and month projections, a structured event creation flow, collision-aware layout, and validated event schemas backed by dedicated Firestore indexes."
        },
        {
          title: "Settings Console",
          desc: "Consolidated general, workspace, notification, and security controls into a unified settings surface built on a shared primitive set."
        },
        {
          title: "Preference & Theme Layer",
          desc: "Added light, dark, and system colour modes applied before first paint, alongside reduced-motion, 24-hour clock, and manual presence overrides persisted per operator."
        },
        {
          title: "Session & Perimeter Hardening",
          desc: "Moved authentication to httpOnly session cookies with middleware-enforced route guards, validated redirect targets, and an expanded permission matrix across every server action."
        },
        {
          title: "Telemetry Stream Guard",
          desc: "Rebuilt the activity stream endpoint with throttling and backpressure protection to keep long-lived connections stable under sustained workspace load."
        },
        {
          title: "Marketing Surface Unification",
          desc: "Extracted shared navigation and footer chrome across all public pages, and introduced generated OpenGraph imagery for link previews."
        },
        {
          title: "Data Integrity Backfill",
          desc: "Shipped a backfill routine alongside expanded Firestore rules and indexes to normalise historical records against the current schema."
        }
      ]
    },
    {
      month: "July 2026",
      entries: [
        {
          title: "System Explorer",
          desc: "Introduced the project file explorer with server-side listing actions, giving each project a navigable document surface."
        },
        {
          title: "Signed Asset Uploads",
          desc: "Moved file ingestion to signature-authorised uploads, removing credential exposure from the client."
        },
        {
          title: "Download Path Correction",
          desc: "Resolved cross-origin download failures by resolving stored secure URLs directly and detecting resource type for document formats."
        },
        {
          title: "Command Center",
          desc: "Deployed the live operations feed with throttled activity streaming and scroll-aware notification handling."
        },
        {
          title: "Multi-Assignee Directive System",
          desc: "Directives now support multiple assigned operators, with task creation, editing, and personnel telemetry updated to reflect shared ownership."
        },
        {
          title: "Chronological Stream Integrity",
          desc: "Enforced explicit timestamp ordering with top-down flow and restored smooth auto-scroll on the activity feed."
        }
      ]
    },
    {
      month: "June 2026",
      entries: [
        {
          title: "Project Priority List",
          desc: "Established the project dashboard architecture with formal data models, server actions, and priority-ordered workspace views."
        },
        {
          title: "Project Lifecycle Actions",
          desc: "Implemented rename, archive, priority reassignment, and cascading deletion as authorised server-side operations."
        },
        {
          title: "Personnel Hub",
          desc: "Introduced member workload visualisation and operational status reporting across the workspace roster."
        },
        {
          title: "Authentication Surfaces",
          desc: "Rebuilt the login and workspace registration flows to match the Architectural Void system."
        }
      ]
    },
    {
      month: "May 2026",
      entries: [
        {
          title: "Dashboard Orchestration Service",
          desc: "Centralised dashboard composition behind a single orchestration layer, separating view assembly from data retrieval."
        },
        {
          title: "Team Management",
          desc: "Delivered the dedicated team page with member administration and hardened removal actions."
        },
        {
          title: "Member Invitation Dispatch",
          desc: "Wired the invitation dialog to transactional email delivery over a verified sending domain."
        },
        {
          title: "Automated Daily Digest",
          desc: "Scheduled a morning digest email summarising outstanding directives and workspace movement."
        },
        {
          title: "Next.js 15 Migration",
          desc: "Upgraded the application framework and dependency surface, aligning routing and server action contracts with the current release."
        },
        {
          title: "Workload & Profile Controls",
          desc: "Added the team workload card and operator profile interface for self-service identity management."
        },
        {
          title: "File Access Enforcement",
          desc: "Scoped project file read access to verified organisational membership at the rules layer."
        },
        {
          title: "Brand Identity Assets",
          desc: "Introduced the application icon and branding assets across the product and public surfaces."
        }
      ]
    },
    {
      month: "April 2026",
      entries: [
        {
          title: "Workspace Security Hardening",
          desc: "Migrated member invitations to atomic server-side transactions. Implemented identity parity validation to prevent unauthorized privilege escalation."
        },
        {
          title: "Collaborative Directive Log",
          desc: "Unlocked task note contributions for all workspace members. Hardened Firestore security rules to permit operational updates while maintaining strict organizational isolation."
        },
        {
          title: "Architectural Void Evolution",
          desc: "Finalized the transition to a high-fidelity monochromatic aesthetic. Purged legacy accent colors in favor of a curated silver-white and black design system."
        },
        {
          title: "Destructive Protocol Stabilization",
          desc: "Standardized warning modals and confirmation flows for system-wide deletions. Improved state management and error feedback during resource removal."
        },
        {
          title: "Integrated Directive Deletion",
          desc: "Implemented secure task removal capabilities for both owners and authorized members within the Master Objective List."
        },
        {
          title: "Telemetry Feed Optimization",
          desc: "Enhanced real-time activity logs with high-fidelity glow effects and Bold Metadata Terminology for improved operational clarity."
        },
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
      ]
    }
  ];

  return (
    <main className="theme-dark min-h-screen bg-[#050505] text-[#ededed] font-sans selection:bg-white/[0.1]">
      <MarketingNav active="changelog" />

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
        {releases.map((release) => (
          <ScrollReveal key={release.month}>
            <div className="mb-32">
              <h2 className="font-mono text-[11px] tracking-[0.3em] text-[#555555] uppercase mb-12 flex items-center gap-4">
                {release.month}
                <span className="flex-grow h-px bg-white/[0.04]"></span>
              </h2>

              <div className="space-y-24">
                {release.entries.map((item, i) => (
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
        ))}

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

      <MarketingFooter />
    </main>
  );
}
