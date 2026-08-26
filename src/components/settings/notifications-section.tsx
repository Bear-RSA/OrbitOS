"use client";

import { Bell, Mail } from "lucide-react";

import { User } from "@/types/auth";
import { usePreferences } from "@/hooks/use-preferences";
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

      <DashboardCard interactive={false} tone="quiet">
        <CardHeader title="In-app" icon={Bell} />
        <p className="max-w-lg text-[13px] font-light leading-relaxed text-ink-muted">
          Activity is surfaced live on the dashboard and in each project&apos;s
          pulse feed. There is nothing to configure here yet — per-event alerts
          land in a later release.
        </p>
      </DashboardCard>
    </div>
  );
}
