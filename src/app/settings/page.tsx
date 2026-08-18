"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Building2,
  CalendarClock,
  Shield,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Loader } from "@/components/ui/loader";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { BillingPanel } from "@/components/dashboard/billing-panel";
import { GeneralSection } from "@/components/settings/general-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { CalendarSection } from "@/components/settings/calendar-section";
import { SecuritySection } from "@/components/settings/security-section";
import { WorkspaceSection } from "@/components/settings/workspace-section";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/*                                                                     */
/*  Reached from the profile page. Every tab here is backed by real    */
/*  state: preferences persist to `users/{uid}.preferences`, workspace */
/*  identity to `organizations/{orgId}`, and billing to the existing   */
/*  subscription panel.                                                */
/* ------------------------------------------------------------------ */

type TabId = "general" | "notifications" | "calendar" | "security" | "workspace" | "billing";

const TABS: {
  id: TabId;
  label: string;
  icon: typeof Shield;
  ownerOnly?: boolean;
  blurb: string;
}[] = [
  {
    id: "general",
    label: "General",
    icon: SlidersHorizontal,
    blurb: "Your account, presence, and how the interface behaves.",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    blurb: "What OrbitOS sends you, and when.",
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: CalendarClock,
    blurb: "Subscribe to your schedule from Google, Outlook, or Apple.",
  },
  {
    id: "security",
    label: "Security",
    icon: Shield,
    blurb: "Password, active sessions, and sign-out.",
  },
  {
    id: "workspace",
    label: "Workspace",
    icon: Building2,
    ownerOnly: true,
    blurb: "Organization identity and team composition.",
  },
  {
    id: "billing",
    label: "Billing",
    icon: Wallet,
    ownerOnly: true,
    blurb: "Plan, usage, and upgrades.",
  },
];

function isTabId(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

/** Shared by the auth gate and the `useSearchParams` Suspense boundary. */
function SettingsLoader() {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-base">
      <Loader />
      <div className="flex flex-col items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">
          Loading Settings
        </span>
        <div className="h-px w-24 bg-gradient-to-r from-transparent via-line/15 to-transparent" />
      </div>
    </div>
  );
}

function SettingsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>("general");

  const isOwner = user?.role === "OWNER";
  const visibleTabs = useMemo(
    () => TABS.filter((tab) => !tab.ownerOnly || isOwner),
    [isOwner]
  );

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  // `?tab=billing` is how the PayFast return URL and the profile shortcut
  // land the user directly on a section.
  useEffect(() => {
    const requested = searchParams.get("tab");
    if (isTabId(requested)) setActiveTab(requested);
  }, [searchParams]);

  // A member who lands on an owner-only tab — by URL, or by being demoted
  // while the page is open — is moved somewhere they can actually see.
  useEffect(() => {
    const tab = TABS.find((t) => t.id === activeTab);
    if (tab?.ownerOnly && !isOwner) setActiveTab("general");
  }, [activeTab, isOwner]);

  if (loading) return <SettingsLoader />;

  if (!user) return null;

  const current = visibleTabs.find((t) => t.id === activeTab) ?? visibleTabs[0];

  return (
    <DashboardShell className="min-h-[100dvh] bg-base text-ink selection:bg-surface-hover selection:text-ink-strong">
      {/* ── Chrome ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 -mx-5 mb-10 border-b border-line/[0.05] bg-base/80 px-5 backdrop-blur-xl sm:-mx-8 sm:mb-14 sm:px-8 lg:-mx-10 lg:px-10">
        <div className="flex h-16 items-center justify-between gap-4 tracking-tight">
          <button
            onClick={() => router.push("/profile")}
            className="group flex items-center gap-3 rounded-lg py-1 pr-2 text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-raised ring-1 ring-inset ring-line/[0.06] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-x-0.5 group-hover:bg-surface-hover">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
              Profile
            </span>
          </button>

          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            Settings
          </span>
        </div>
      </header>

      {/* ── Title ──────────────────────────────────────────────────── */}
      <div className="mb-10">
        <h1 className="text-[clamp(2rem,4.5vw,2.75rem)] font-extralight leading-none tracking-tight text-ink">
          Settings
        </h1>
        <p className="mt-4 max-w-lg text-[14px] font-light leading-relaxed text-ink-muted">
          {current.blurb}
        </p>
      </div>

      <div className="flex flex-col gap-10 lg:flex-row lg:gap-14">
        {/* ── Tab rail ─────────────────────────────────────────────── */}
        <nav
          aria-label="Settings sections"
          className={cn(
            "shrink-0 lg:sticky lg:top-24 lg:h-fit lg:w-56",
            "-mx-5 overflow-x-auto px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:overflow-visible lg:px-0"
          )}
        >
          <div className="flex gap-1.5 lg:flex-col">
            {visibleTabs.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left",
                    "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base",
                    active
                      ? "bg-surface-control text-ink ring-1 ring-inset ring-line/[0.08]"
                      : "text-ink-dim hover:bg-surface-card hover:text-ink-muted"
                  )}
                >
                  <tab.icon
                    className={cn("h-3.5 w-3.5 shrink-0", !active && "opacity-60")}
                    aria-hidden
                  />
                  <span className="whitespace-nowrap text-[13px] font-light tracking-tight">
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* ── Panel ────────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 pb-24">
          <ScrollReveal key={activeTab} yOffset={16} duration={450}>
            {activeTab === "general" && <GeneralSection user={user} />}
            {activeTab === "notifications" && <NotificationsSection user={user} />}
            {activeTab === "calendar" && <CalendarSection user={user} />}
            {activeTab === "security" && <SecuritySection />}
            {activeTab === "workspace" && isOwner && <WorkspaceSection user={user} />}
            {activeTab === "billing" && isOwner && <BillingPanel />}
          </ScrollReveal>
        </div>
      </div>
    </DashboardShell>
  );
}

/**
 * `useSearchParams` forces the tree into client-side rendering, so Next
 * requires the boundary rather than letting the whole route bail out.
 */
export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsLoader />}>
      <SettingsView />
    </Suspense>
  );
}
