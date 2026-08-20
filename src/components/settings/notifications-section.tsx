"use client";

import { Bell, Inbox, Mail } from "lucide-react";

import { User } from "@/types/auth";
import { usePreferences } from "@/hooks/use-preferences";
import {
  DashboardCard,
  CardHeader,
  StatusChip,
} from "@/components/dashboard/dashboard-card";
import {
  FormNotice,
  ReadonlyRow,
  SettingsList,
  ToggleRow,
} from "./settings-primitives";

/* ------------------------------------------------------------------ */
/*  Notifications                                                      */
/*                                                                     */
/*  Two emails ship today, and they have different audiences.          */
/*                                                                     */
/*  The morning digest is owner-only — `/api/digest` looks up the      */
/*  OWNER of each organization and nobody else, so showing a member a  */
/*  switch for it would be a switch that does nothing.                 */
/*                                                                     */
/*  Due reminders go to whoever a task is ASSIGNED to, which is        */
/*  usually a member. Everyone gets that toggle.                       */
/* ------------------------------------------------------------------ */

export function NotificationsSection({ user }: { user: User }) {
  const { preferences, update, pending, error } = usePreferences();
  const isOwner = user.role === "OWNER";

  const emailOn =
    preferences.taskReminders || (isOwner && preferences.dailyDigest);

  return (
    <div className="flex flex-col gap-6">
      <DashboardCard interactive={false}>
        <CardHeader
          title="Email"
          icon={Mail}
          meta={
            <StatusChip
              label={emailOn ? "On" : "Off"}
              tone={emailOn ? "positive" : "neutral"}
            />
          }
        />

        <SettingsList>
          {isOwner && (
            <ToggleRow
              id="pref-daily-digest"
              title="Daily digest"
              description="A morning summary of overdue work, stalled tasks, and project risk, sent to your sign-in address."
              checked={preferences.dailyDigest}
              busy={pending === "dailyDigest"}
              onChange={(next) => update({ dailyDigest: next })}
            />
          )}

          {isOwner && (
            <ToggleRow
              id="pref-digest-attention"
              title="Only when something needs attention"
              description="Skip the digest entirely on days with nothing overdue or stalled, instead of sending an all-clear."
              checked={preferences.digestOnlyWhenAttention}
              disabled={!preferences.dailyDigest}
              busy={pending === "digestOnlyWhenAttention"}
              onChange={(next) => update({ digestOnlyWhenAttention: next })}
            />
          )}

          <ToggleRow
            id="pref-task-reminders"
            title="Task due reminders"
            description={
              isOwner
                ? "An email 24 hours before work assigned to you falls due, plus anything due with nobody assigned — one message covering everything landing that day."
                : "An email 24 hours before work assigned to you falls due — one message covering everything landing that day."
            }
            checked={preferences.taskReminders}
            busy={pending === "taskReminders"}
            onChange={(next) => update({ taskReminders: next })}
          />

          <ReadonlyRow
            title="Delivered to"
            description="Email always goes to your sign-in address."
            value={user.email}
          />
        </SettingsList>

        {!isOwner && (
          <div className="mt-5 flex items-start gap-4 rounded-2xl bg-surface-card p-5 ring-1 ring-inset ring-line/[0.05]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-control ring-1 ring-inset ring-line/[0.08]">
              <Inbox className="h-4 w-4 text-ink-muted" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium tracking-tight text-ink">
                The daily digest is owner-only
              </p>
              <p className="mt-2 max-w-md text-[13px] font-light leading-relaxed text-ink-muted">
                Workspace-wide summaries go to owners, along with reminders for
                work nobody is assigned to. You still get a reminder the day
                before your own work is due.
              </p>
            </div>
          </div>
        )}

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
