"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { doc, updateDoc } from "firebase/firestore";
import {
  ArrowUpRight,
  Circle,
  Crown,
  Gauge,
  Mail,
  MonitorCog,
  Moon,
  UserRound,
  Users,
  Zap,
} from "lucide-react";

import { db } from "@/lib/firebase/client";
import { User } from "@/types/auth";
import { PresenceMode } from "@/types/preferences";
import { usePreferences } from "@/hooks/use-preferences";
import {
  DashboardCard,
  CardHeader,
  StatusChip,
} from "@/components/dashboard/dashboard-card";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  FormNotice,
  ReadonlyRow,
  SegmentedRow,
  SettingsButton,
  SettingsList,
  ToggleRow,
} from "./settings-primitives";

/* ------------------------------------------------------------------ */
/*  General — identity summary, presence, and interface preferences     */
/* ------------------------------------------------------------------ */

const PRESENCE_OPTIONS: { value: PresenceMode; label: string; icon: typeof Zap }[] = [
  { value: "auto", label: "Auto", icon: Gauge },
  { value: "available", label: "Available", icon: Circle },
  { value: "focused", label: "Focused", icon: Zap },
  { value: "offline", label: "Offline", icon: Moon },
];

export function GeneralSection({ user }: { user: User }) {
  const router = useRouter();
  const { preferences, update, pending, error } = usePreferences();
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [presenceSaving, setPresenceSaving] = useState(false);

  const isOwner = user.role === "OWNER";
  const joined = user.createdAt?.toDate
    ? format(user.createdAt.toDate(), "d MMM yyyy")
    : "—";

  /**
   * Presence writes three fields at once, so it does not go through the
   * generic preference hook.
   *
   * `manualOverride` is what the status engine in `syncOperationalStatusAction`
   * reads before it recalculates presence from workload — without it, an
   * explicit choice here would be silently reverted on the next task change.
   */
  const handlePresence = async (next: PresenceMode) => {
    if (next === preferences.presence) return;
    setPresenceSaving(true);
    setPresenceError(null);
    try {
      await updateDoc(doc(db, "users", user.id), {
        preferences: { ...preferences, presence: next },
        manualOverride: next !== "auto",
        ...(next === "auto" ? {} : { operationalStatus: next }),
      });
    } catch (err) {
      console.error("[Settings] Presence update failed", err);
      setPresenceError("Could not update your presence. Try again.");
    } finally {
      setPresenceSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Account ───────────────────────────────────────────────── */}
      <DashboardCard interactive={false}>
        <CardHeader
          title="Account"
          icon={UserRound}
          meta={
            <StatusChip
              label={user.role}
              icon={isOwner ? Crown : Users}
              tone="neutral"
            />
          }
        />

        <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-center">
          <UserAvatar photoURL={user.photoURL} name={user.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-light tracking-tight text-ink">
              {user.name}
            </p>
            <p className="mt-1.5 inline-flex min-w-0 items-center gap-2">
              <Mail className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden />
              <span className="truncate font-mono text-[12px] text-ink-muted">
                {user.email}
              </span>
            </p>
          </div>
          <SettingsButton
            variant="quiet"
            icon={ArrowUpRight}
            onClick={() => router.push("/profile")}
          >
            Edit Profile
          </SettingsButton>
        </div>

        <SettingsList className="border-t border-white/[0.05] pt-5">
          <ReadonlyRow
            title="Member since"
            description="The day this account joined the workspace."
            value={joined}
          />
          <ReadonlyRow
            title="Sign-in email"
            description="Changing this requires re-verification and is not yet self-service."
            value={user.email}
          />
        </SettingsList>
      </DashboardCard>

      {/* ── Presence ──────────────────────────────────────────────── */}
      <DashboardCard interactive={false}>
        <CardHeader
          title="Presence"
          icon={Gauge}
          meta={
            <StatusChip
              label={preferences.presence === "auto" ? "Automatic" : "Manual"}
              tone={preferences.presence === "auto" ? "neutral" : "warning"}
            />
          }
        />

        <SettingsList>
          <SegmentedRow<PresenceMode>
            title="How teammates see you"
            description={
              preferences.presence === "auto"
                ? "OrbitOS derives your status from active workload and recent activity."
                : "Your status is pinned to this value until you switch back to Auto."
            }
            value={preferences.presence}
            options={PRESENCE_OPTIONS}
            onChange={handlePresence}
            disabled={presenceSaving}
          />
        </SettingsList>

        <FormNotice tone="error">{presenceError}</FormNotice>
      </DashboardCard>

      {/* ── Interface ─────────────────────────────────────────────── */}
      <DashboardCard interactive={false}>
        <CardHeader title="Interface" icon={MonitorCog} />

        <SettingsList>
          <ToggleRow
            id="pref-clock-24h"
            title="24-hour clock"
            description="Shows the dashboard clock as 14:05 rather than 2:05 PM."
            checked={preferences.clock24h}
            busy={pending === "clock24h"}
            onChange={(next) => update({ clock24h: next })}
          />
          <ToggleRow
            id="pref-reduced-motion"
            title="Reduce motion"
            description="Turns off reveal animations and transitions. Your device setting is always respected on top of this."
            checked={preferences.reducedMotion}
            busy={pending === "reducedMotion"}
            onChange={(next) => update({ reducedMotion: next })}
          />
          <ReadonlyRow
            title="Appearance"
            description="OrbitOS is built for a single dark surface. A light theme is not available."
            value={
              <span className="inline-flex items-center gap-2">
                <Moon className="h-3 w-3 text-ink-faint" aria-hidden />
                Dark
              </span>
            }
          />
        </SettingsList>

        <FormNotice tone="error">{error}</FormNotice>
      </DashboardCard>
    </div>
  );
}
