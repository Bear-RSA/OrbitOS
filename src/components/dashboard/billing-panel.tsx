"use client";

import Link from "next/link";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase/client";
import { doc, onSnapshot, collection, query, where, getDocs } from "firebase/firestore";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import {
  Crown,
  Users,
  FolderOpen,
  ArrowUpRight,
  CheckCircle2,
  Zap,
  Shield,
  Rocket,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import {
  TIER_DEFINITIONS,
  type SubscriptionTier,
  type OrgSubscription,
} from "@/types/subscription";

/* ------------------------------------------------------------------ */
/*  Billing Panel — OWNER-only subscription management                 */
/*                                                                     */
/*  Displays current plan, usage meters, and available tiers.          */
/*  Restricted to OWNER role via parent guard in settings/page.tsx.    */
/* ------------------------------------------------------------------ */

const TIER_ICONS: Record<SubscriptionTier, React.ElementType> = {
  exploration: Eye,
  foundational: Shield,
  studio_core: Rocket,
  total_visibility: Crown,
};

const TIER_ACCENTS: Record<SubscriptionTier, string> = {
  exploration: "#666666",
  foundational: "#A078FF",
  studio_core: "#00D4AA",
  total_visibility: "#FFB800",
};

interface UsageData {
  members: number;
  projects: number;
  owners: number;
}

export function BillingPanel() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Partial<OrgSubscription> | null>(null);
  const [usage, setUsage] = useState<UsageData>({ members: 0, projects: 0, owners: 0 });
  const [loading, setLoading] = useState(true);

  const orgId = user?.orgId;

  // Subscribe to org subscription state
  useEffect(() => {
    if (!orgId) return;

    const unsub = onSnapshot(doc(db, "organizations", orgId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSubscription(data?.subscription || { tier: "exploration", status: "active" });
      } else {
        setSubscription({ tier: "exploration", status: "active" });
      }
    });

    return () => unsub();
  }, [orgId]);

  // Fetch current usage counts
  useEffect(() => {
    if (!orgId) return;

    async function fetchUsage() {
      try {
        // Count members
        const membersSnap = await getDocs(
          query(collection(db, "users"), where("orgId", "==", orgId))
        );
        const members = membersSnap.size;
        const owners = membersSnap.docs.filter(
          (d) => d.data().role?.toUpperCase() === "OWNER"
        ).length;

        // Count active projects
        const projectsSnap = await getDocs(
          query(collection(db, "projects"), where("orgId", "==", orgId))
        );
        const projects = projectsSnap.docs.filter(
          (d) => !d.data().archived
        ).length;

        setUsage({ members, projects, owners });
      } catch (err) {
        console.error("[BillingPanel] Failed to fetch usage:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchUsage();
  }, [orgId]);

  if (!user || !orgId) return null;

  const currentTier = (subscription?.tier as SubscriptionTier) || "exploration";
  const tierDef = TIER_DEFINITIONS[currentTier];
  const tierAccent = TIER_ACCENTS[currentTier];
  const TierIcon = TIER_ICONS[currentTier];

  const isSandbox = process.env.NEXT_PUBLIC_PAYFAST_SANDBOX === "true";
  const merchantId = process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_ID || "";
  const merchantKey = process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_KEY || "";
  const payfastBaseUrl = isSandbox
    ? "https://sandbox.payfast.co.za/eng/process"
    : "https://www.payfast.co.za/eng/process";

  function buildPayfastFields(tier: SubscriptionTier): Record<string, string> {
    const def = TIER_DEFINITIONS[tier];
    const origin = typeof window !== "undefined" ? window.location.origin : "";

    return {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      amount: def.priceZAR.toFixed(2),
      item_name: `OrbitOS ${def.name} Plan`,
      item_description: `Monthly subscription — ${def.name}`,
      custom_str1: orgId!,
      custom_str2: tier,
      subscription_type: "1",
      billing_date: new Date().toISOString().split("T")[0],
      recurring_amount: def.priceZAR.toFixed(2),
      frequency: "3",
      cycles: "0",
      return_url: `${origin}/settings?tab=billing`,
      cancel_url: `${origin}/settings?tab=billing`,
      notify_url: `${origin}/api/payfast/webhook`,
    };
  }

  return (
    <div className="space-y-20">
      {/* Active Plan Card */}
      <ScrollReveal delay={100}>
        <div className="space-y-8">
          <h3 className="text-[11px] font-mono uppercase tracking-widest text-[#444444]">
            Active Subscription
          </h3>

          <div
            className="relative overflow-hidden rounded-2xl bg-[#0A0A0A] ring-1 ring-white/[0.04] p-10"
            style={{ borderTop: `1px solid ${tierAccent}20` }}
          >
            {/* Tier glow accent */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-px"
              style={{ background: `linear-gradient(90deg, transparent, ${tierAccent}40, transparent)` }}
            />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-10">
              {/* Plan identity */}
              <div className="flex items-center gap-6">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center ring-1"
                  style={{
                    background: `${tierAccent}08`,
                    borderColor: `${tierAccent}20`,
                    border: `1px solid ${tierAccent}20`,
                  }}
                >
                  <TierIcon className="w-6 h-6" style={{ color: tierAccent }} />
                </div>
                <div>
                  <h4 className="text-xl font-light text-[#ededed] tracking-tight">{tierDef.name}</h4>
                  <p className="text-[12px] text-[#555555] font-mono mt-1">
                    {tierDef.priceZAR === 0 ? "FREE" : `R${tierDef.priceZAR}/mo`}
                    <span className="text-[#333333] ml-3">•</span>
                    <span
                      className="ml-3 uppercase tracking-widest text-[10px]"
                      style={{ color: subscription?.status === "active" ? "#00D4AA" : "#E57A7A" }}
                    >
                      {subscription?.status || "active"}
                    </span>
                  </p>
                </div>
              </div>

              {/* Usage gauges */}
              <div className="flex gap-10">
                <UsageMeter
                  label="Members"
                  icon={Users}
                  current={usage.members}
                  limit={tierDef.limits.maxMembers}
                  accent={tierAccent}
                  loading={loading}
                />
                <UsageMeter
                  label="Projects"
                  icon={FolderOpen}
                  current={usage.projects}
                  limit={tierDef.limits.maxProjects}
                  accent={tierAccent}
                  loading={loading}
                />
              </div>
            </div>
          </div>
        </div>
      </ScrollReveal>

      {/* Tier Grid */}
      <ScrollReveal delay={200}>
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-mono uppercase tracking-widest text-[#444444]">
              Available Plans
            </h3>
            <div className="flex items-center gap-2 opacity-50">
              <Zap className="w-3.5 h-3.5 text-[#A078FF]" />
              <span className="text-[10px] font-mono text-[#A078FF] uppercase tracking-widest">
                Upgrade Anytime
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {Object.values(TIER_DEFINITIONS).map((def) => {
              const isActive = currentTier === def.id;
              const Icon = TIER_ICONS[def.id];
              const accent = TIER_ACCENTS[def.id];

              return (
                <div
                  key={def.id}
                  className={cn(
                    "group relative rounded-2xl p-8 transition-all duration-300",
                    isActive
                      ? "bg-[#0A0A0A] ring-1"
                      : "bg-[#070707] ring-1 ring-white/[0.03] hover:ring-white/[0.06] hover:bg-[#0A0A0A]"
                  )}
                  style={isActive ? { borderColor: `${accent}30`, boxShadow: `inset 0 1px 0 ${accent}10, 0 0 0 1px ${accent}20` } : {}}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute top-4 right-4 flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5" style={{ color: accent }} />
                      <span
                        className="text-[9px] font-mono uppercase tracking-[0.2em]"
                        style={{ color: accent }}
                      >
                        Active
                      </span>
                    </div>
                  )}

                  <div className="flex items-start gap-5 mb-8">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{
                        background: `${accent}08`,
                        border: `1px solid ${accent}15`,
                      }}
                    >
                      <Icon className="w-4 h-4" style={{ color: accent }} />
                    </div>
                    <div>
                      <h4 className="text-[15px] font-light text-[#ededed] tracking-tight">
                        {def.name}
                      </h4>
                      <p className="text-[11px] text-[#444444] mt-1 font-light">
                        {def.description}
                      </p>
                    </div>
                  </div>

                  {/* Limits */}
                  <div className="space-y-3 mb-8">
                    <LimitRow label="Owners" value={def.limits.maxOwners} />
                    <LimitRow label="Members" value={def.limits.maxMembers} />
                    <LimitRow label="Projects" value={def.limits.maxProjects} />
                  </div>

                  {/* Price + Action */}
                  <div className="flex items-center justify-between pt-6 border-t border-white/[0.04]">
                    <div>
                      <span className="text-xl font-light text-[#ededed] tracking-tight">
                        {def.priceZAR === 0 ? "Free" : `R${def.priceZAR}`}
                      </span>
                      {def.priceZAR > 0 && (
                        <span className="text-[10px] font-mono text-[#333333] ml-1.5">/mo</span>
                      )}
                    </div>

                    {isActive ? (
                      <span className="text-[10px] font-mono text-[#333333] uppercase tracking-widest">
                        Current Plan
                      </span>
                    ) : def.id === "exploration" ? (
                      /* Free tier — route to auth */
                      <Link
                        href="/login"
                        className="flex items-center gap-2 h-9 px-5 rounded-xl text-[11px] font-mono uppercase tracking-[0.15em] transition-all duration-300 bg-[#111111] hover:bg-[#1a1a1a] text-[#ededed] ring-1 ring-white/[0.04] hover:ring-white/[0.08]"
                      >
                        Get Started
                        <ArrowUpRight className="w-3 h-3 opacity-60" />
                      </Link>
                    ) : def.id === "total_visibility" ? (
                      /* Growth tier — route to contact sales */
                      <Link
                        href="/contact-sales"
                        className="flex items-center gap-2 h-9 px-5 rounded-xl text-[11px] font-mono uppercase tracking-[0.15em] transition-all duration-300 bg-[#111111] hover:bg-[#1a1a1a] text-[#ededed] ring-1 ring-white/[0.04] hover:ring-white/[0.08]"
                      >
                        Contact Sales
                        <ArrowUpRight className="w-3 h-3 opacity-60" />
                      </Link>
                    ) : (
                      /* Paid tiers (Foundational, Studio Core) — Payfast POST form */
                      <form method="POST" action={payfastBaseUrl}>
                        {Object.entries(buildPayfastFields(def.id)).map(([key, value]) => (
                          <input key={key} type="hidden" name={key} value={value} />
                        ))}
                        <button
                          type="submit"
                          className="flex items-center gap-2 h-9 px-5 rounded-xl text-[11px] font-mono uppercase tracking-[0.15em] transition-all duration-300 bg-[#111111] hover:bg-[#1a1a1a] text-[#ededed] ring-1 ring-white/[0.04] hover:ring-white/[0.08] cursor-pointer"
                        >
                          Get Started
                          <ArrowUpRight className="w-3 h-3 opacity-60" />
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </ScrollReveal>

      {/* Payment notice */}
      <ScrollReveal delay={300}>
        <div className="flex items-center gap-4 px-6 py-4 rounded-xl bg-[#0A0A0A] ring-1 ring-white/[0.03]">
          <Shield className="w-4 h-4 text-[#333333] flex-shrink-0" />
          <p className="text-[11px] font-mono text-[#333333] leading-relaxed">
            Payments are processed securely via Payfast. All subscriptions are billed monthly in ZAR.
            Downgrade to Exploration at any time.
          </p>
        </div>
      </ScrollReveal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function UsageMeter({
  label,
  icon: Icon,
  current,
  limit,
  accent,
  loading,
}: {
  label: string;
  icon: React.ElementType;
  current: number;
  limit: number;
  accent: string;
  loading: boolean;
}) {
  const isUnlimited = limit === -1;
  const percentage = isUnlimited ? 30 : Math.min((current / limit) * 100, 100);
  const isNearLimit = !isUnlimited && percentage >= 80;

  return (
    <div className="min-w-[120px]">
      <div className="flex items-center gap-2 mb-2.5">
        <Icon className="w-3 h-3 text-[#444444]" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#555555]">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-lg font-light text-[#ededed] tracking-tight">
          {loading ? "—" : current}
        </span>
        <span className="text-[10px] font-mono text-[#333333]">
          / {isUnlimited ? "∞" : limit}
        </span>
      </div>
      {/* Progress bar */}
      <div className="h-1 w-full rounded-full bg-[#111111] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${percentage}%`,
            background: isNearLimit ? "#E57A7A" : accent,
            opacity: loading ? 0.3 : 0.7,
          }}
        />
      </div>
    </div>
  );
}

function LimitRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-mono text-[#444444]">{label}</span>
      <span className="text-[12px] font-mono text-[#888888]">
        {value === -1 ? "Unlimited" : value}
      </span>
    </div>
  );
}
