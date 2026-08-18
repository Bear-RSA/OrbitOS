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
/*  Only the morning digest is delivered today, and only to owners —   */
/*  `/api/digest` looks up the OWNER of each organization. Members get */
/*  an explanation instead of switches that would do nothing.          */
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
              label={isOwner && preferences.dailyDigest ? "On" : "Off"}
              tone={isOwner && preferences.dailyDigest ? "positive" : "neutral"}
            />
          }
        />

        {isOwner ? (
          <SettingsList>
            <ToggleRow
              id="pref-daily-digest"
              title="Daily digest"
              description="A morning summary of overdue work, stalled tasks, and project risk, sent to your sign-in address."
              checked={preferences.dailyDigest}
              busy={pending === "dailyDigest"}
              onChange={(next) => update({ dailyDigest: next })}
            />
            <ToggleRow
              id="pref-digest-attention"
              title="Only when something needs attention"
              description="Skip the digest entirely on days with nothing overdue or stalled, instead of sending an all-clear."
              checked={preferences.digestOnlyWhenAttention}
              disabled={!preferences.dailyDigest}
              busy={pending === "digestOnlyWhenAttention"}
              onChange={(next) => update({ digestOnlyWhenAttention: next })}
            />
            <ReadonlyRow
              title="Delivered to"
              description="The digest always goes to your sign-in address."
              value={user.email}
            />
          </SettingsList>
        ) : (
          <div className="flex items-start gap-4 rounded-2xl bg-white/[0.03] p-5 ring-1 ring-inset ring-white/[0.05]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-inset ring-white/[0.08]">
              <Inbox className="h-4 w-4 text-ink-muted" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium tracking-tight text-ink">
                No email notifications for members yet
              </p>
              <p className="mt-2 max-w-md text-[13px] font-light leading-relaxed text-ink-muted">
                The daily digest currently goes to workspace owners only. Your
                assigned work stays visible on the dashboard.
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
