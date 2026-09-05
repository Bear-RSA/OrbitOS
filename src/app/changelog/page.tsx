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
      month: "September 2026",
      entries: [
        {
          title: "Voice & Video Calls",
          desc: "Deployed the call room on Daily, covering direct calls between operators and multi-party rooms. The prejoin screen and connection states are handled inside the app rather than left to the provider's defaults."
        },
        {
          title: "Call Access & Tier Limits",
          desc: "Participant and guest ceilings resolve from the workspace tier and are enforced before a room is ever issued. Incoming call subscriptions are scoped by organisation, so a ring never crosses workspace boundaries."
        },
        {
          title: "Call Room Theming",
          desc: "The embedded call surface now carries the OrbitOS palette and follows the operator's light or dark mode instead of rendering in the provider's own chrome."
        },
        {
          title: "Audible Ringing",
          desc: "Internal calls ring through a generated tone on both ends, driven by a shared audio context and switchable per operator from notification settings."
        },
        {
          title: "Direct Messages",
          desc: "Shipped workspace messaging with one-to-one conversations and groups. Posting rights derive from role rather than channel ownership, and group size is bounded by the workspace tier."
        },
        {
          title: "Unread State & Chimes",
          desc: "Added an unread hook that drives the message rail, and a notifier mounted at the application root so a new message chimes wherever the operator happens to be."
        },
        {
          title: "Emoji, GIFs & Stickers",
          desc: "Added an emoji picker and a media picker backed by a session-gated, rate-limited search route. The provider key stays on the server, and attachments are validated before they reach a thread."
        },
        {
          title: "Conversation Clearing",
          desc: "Operators can clear a conversation from their own rail without removing it for anyone else in the thread."
        },
        {
          title: "Member Profiles",
          desc: "Introduced the member profile panel, reachable from both the message rail and the personnel hub."
        },
        {
          title: "Presence from Heartbeat",
          desc: "Presence is now decided by a live heartbeat rather than a self-set status that never decays. A stored status only counts once the heartbeat has vouched for it, and relative times tick without a refresh."
        },
        {
          title: "Password Reset Delivery",
          desc: "Reset credentials are minted server side and carried by Resend, replacing the client SDK path that had no delivery log and no bounce reporting. A reset that never landed used to look identical to one that was never sent."
        },
        {
          title: "Unified Caller Resolution",
          desc: "Every server action now authenticates through one shared caller resolver instead of parsing the session itself. Task references were reworked in the same pass."
        },
        {
          title: "Dashboard Consolidation",
          desc: "Collapsed the separate owner and member dashboards into a single view, and retired the team workload card in favour of a personal metrics card and a workspace attention card."
        },
        {
          title: "Projects in Focus",
          desc: "The dashboard now spotlights projects by urgency and due date, with the ranking rules pinned by unit tests."
        },
        {
          title: "Shared Application Chrome",
          desc: "Extracted the application header and profile link into shared components, so navigation reads the same across dashboard, projects, messages, teams, settings, and profile."
        },
        {
          title: "Reduced Motion Coverage",
          desc: "Scroll reveals and JavaScript-driven effects now honour the reduced-motion preference, closing the gap left by CSS transitions that already respected it."
        }
      ]
    },
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
        },
        {
          title: "Execution View Tabs",
          desc: "Reorganised the project surface into tabbed execution views, separating the directive table, the file explorer, and the command center behind one shell."
        },
        {
          title: "Task Due Reminders",
          desc: "Assignees are emailed 24 hours before a directive falls due, dispatched from a scheduled run with its own test coverage."
        },
        {
          title: "Engagement Scheduling",
          desc: "Added the engagement creation dialog with validated form logic, and reworked its layout to hold up on wider screens."
        },
        {
          title: "RSVP Responses",
          desc: "Invitees respond to an engagement from a signed link, and the organiser is notified when a response lands. RSVP and calendar feed links now resolve through a single app URL helper."
        },
        {
          title: "Scheduled Mail Consolidation",
          desc: "Added a due-today digest and a metered end-of-day debrief, then fitted four scheduled mails into the two cron slots the hosting plan allows. The due-today digest and owner debrief were retired shortly after."
        },
        {
          title: "Mail Health Monitoring",
          desc: "Added a mail health endpoint and a dashboard banner that raises delivery trouble to owners instead of leaving it in the logs."
        },
        {
          title: "Delivery Failure Tracking",
          desc: "Provider webhooks now record bounces and delivery failures against the send that caused them."
        },
        {
          title: "Canonical Host Correction",
          desc: "Made www the canonical host rather than the apex, and routed generated links through the configured application URL."
        },
        {
          title: "Framework Security Update",
          desc: "Moved Next.js from 15.5.18 to 15.5.23 to take upstream security fixes."
        },
        {
          title: "Lint & Test Baseline",
          desc: "Added an ESLint configuration and cleared what it found, untracked build artefacts from the repository, and covered iCalendar generation, invite dispatch, the guest registry, presence, and the due-reminder run with unit tests."
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
