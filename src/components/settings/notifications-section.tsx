"use client";

import { Bell, Mail } from "lucide-react";

import { User } from "@/types/auth";
import { usePreferences } from "@/hooks/use-preferences";
import { playMessageChime } from "@/lib/messages/chime";
import {
  DashboardCard,
  CardHeader,
  StatusChip,
} from "@/components/dashboard/dashboard-card";
import { FormNotice, ReadonlyRow, SettingsList, ToggleRow } from "./settings-primitives";

/* ------------------------------------------------------------------ */
/*  Notifications                                                      */
/*                                                                     */
/*  One email ships today: a reminder the day before work assigned to  */
/*  you falls due. Unclaimed work due tomorrow goes to the workspace   */
/*  owner instead, which is why the description below reads slightly   */
/*  differently for an owner than for a member.                        */
/* ------------------------------------------------------------------ */

export function NotificationsSection({ user }: { user: User }) {
  const { preferences, update, pending, error } = usePreferences();
  const isOwner = user.role === "OWNER";

  return (
    <div className="flex flex-col gap-6">
      <DashboardCard interactive={false}>
        <CardHeader
          title="Email"
          icon={Mail}
          meta={
            <StatusChip
              label={preferences.taskReminders ? "On" : "Off"}
              tone={preferences.taskReminders ? "positive" : "neutral"}
            />
          }
        />

        <SettingsList>
          <ToggleRow
            id="pref-task-reminders"
            title="Task due reminders"
            description={
              isOwner
                ? "A 09:00 email the day before work assigned to you falls due, plus anything due with nobody assigned — one message covering everything landing that day."
                : "A 09:00 email the day before work assigned to you falls due — one message covering everything landing that day."
            }
            checked={preferences.taskReminders}
            busy={pending === "taskReminders"}
            onChange={(next) => update({ taskReminders: next })}
          />

          <ToggleRow
            id="pref-rsvp-notifications"
            title="RSVP responses"
            description="An email when someone accepts, declines, or tentatively responds to an engagement you organize."
            checked={preferences.rsvpNotifications}
            busy={pending === "rsvpNotifications"}
            onChange={(next) => update({ rsvpNotifications: next })}
          />

          <ReadonlyRow
            title="Delivered to"
            description="Email always goes to your sign-in address."
            value={user.email}
          />
        </SettingsList>

        <FormNotice tone="error">{error}</FormNotice>
      </DashboardCard>

      <DashboardCard interactive={false}>
        <CardHeader
          title="In-app"
          icon={Bell}
          meta={
            <StatusChip
              label={preferences.messageSounds ? "On" : "Off"}
              tone={preferences.messageSounds ? "positive" : "neutral"}
            />
          }
        />

        <SettingsList>
          <ToggleRow
            id="pref-message-sounds"
            title="Message sound"
            description="A short chime when a colleague messages you directly or in a group. Town Hall notices stay silent — they reach the whole workspace at once."
            checked={preferences.messageSounds}
            busy={pending === "messageSounds"}
            onChange={(next) => update({ messageSounds: next })}
          />
        </SettingsList>

        {/* A gesture and a check in one. Pressing it is exactly the
            interaction a browser requires before it will let the page
            make a sound, so it both proves the chime works and unblocks
            it for the rest of the session. If this is audible and a real
            message is not, the fault is in the notifier, not in audio. */}
        <button
          type="button"
          onClick={playMessageChime}
          className="mt-4 self-start rounded-lg border border-line/[0.06] bg-surface-control px-3 py-2 font-mono text-[9px] uppercase tracking-[0.15em] text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
        >
          Play test sound
        </button>
      </DashboardCard>
    </div>
  );
}
