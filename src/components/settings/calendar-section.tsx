"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, Copy, RefreshCw } from "lucide-react";

import { User } from "@/types/auth";
import {
  getCalendarFeedAction,
  regenerateCalendarFeedAction,
} from "@/app/actions/calendar";
import {
  DashboardCard,
  CardHeader,
  StatusChip,
} from "@/components/dashboard/dashboard-card";
import {
  FormNotice,
  SettingsButton,
  SETTINGS_FIELD_CLASS,
} from "./settings-primitives";

/* ------------------------------------------------------------------ */
/*  Calendar subscription                                              */
/*                                                                     */
/*  One-way: OrbitOS publishes, the calendar app reads. Nothing edited */
/*  in Google or Outlook comes back, which is worth saying plainly on  */
/*  the panel rather than letting someone discover it.                 */
/* ------------------------------------------------------------------ */

export function CalendarSection({ user }: { user: User }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const load = useCallback(async () => {
    const result = await getCalendarFeedAction();
    if (result.success) setUrl(result.url);
    else setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not reach the clipboard — select the address and copy it manually.");
    }
  };

  const rotate = async () => {
    if (!confirmRotate) {
      setConfirmRotate(true);
      return;
    }
    setRotating(true);
    setError(null);
    const result = await regenerateCalendarFeedAction();
    if (result.success) setUrl(result.url);
    else setError(result.error);
    setRotating(false);
    setConfirmRotate(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <DashboardCard interactive={false}>
        <CardHeader
          title="Calendar subscription"
          icon={CalendarClock}
          meta={<StatusChip label={url ? "Active" : "Unavailable"} tone={url ? "positive" : "neutral"} />}
        />

        <p className="mb-6 max-w-[62ch] text-[13px] font-light leading-relaxed text-ink-muted">
          Subscribe to this address in Google Calendar, Outlook, or Apple Calendar and your
          directives appear as all-day entries on their due date, with engagements on the clock
          beside them. It updates on its own — no export, no re-import.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            readOnly
            value={loading ? "Resolving…" : (url ?? "Unavailable")}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Calendar subscription address"
            className={`${SETTINGS_FIELD_CLASS} h-10 font-mono text-[12px]`}
          />
          <SettingsButton
            onClick={copy}
            disabled={!url || loading}
            icon={copied ? Check : Copy}
            variant="quiet"
          >
            {copied ? "Copied" : "Copy"}
          </SettingsButton>
        </div>

        <FormNotice tone="error">{error}</FormNotice>

        <div className="mt-8 border-t border-line/[0.06] pt-6">
          <h4 className="mb-2 text-[13px] font-medium tracking-tight text-ink">
            Rotate the address
          </h4>
          <p className="mb-4 max-w-[62ch] text-[13px] font-light leading-relaxed text-ink-muted">
            Anyone holding this address can read your schedule without signing in, so treat it
            like a password. Rotating issues a new one and{" "}
            <span className="text-ink">immediately breaks every existing subscription</span> —
            you will need to re-add it everywhere you use it.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <SettingsButton
              onClick={rotate}
              busy={rotating}
              icon={RefreshCw}
              variant={confirmRotate ? "danger" : "quiet"}
            >
              {confirmRotate ? "Confirm rotation" : "Rotate address"}
            </SettingsButton>

            {confirmRotate && !rotating && (
              <button
                type="button"
                onClick={() => setConfirmRotate(false)}
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim transition-colors hover:text-ink"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </DashboardCard>

      <DashboardCard interactive={false}>
        <CardHeader title="What travels" icon={CalendarClock} />
        <ul className="flex flex-col gap-3 text-[13px] font-light leading-relaxed text-ink-muted">
          <li>
            <span className="text-ink">Directives assigned to you</span> that have a due date and
            are not yet complete — as all-day entries, since a directive owns a day and nothing
            finer.
          </li>
          <li>
            <span className="text-ink">Engagements you are on</span>, at their scheduled time,
            with the location and join link attached.
          </li>
          <li>
            Roughly three months back and a year ahead. Completed directives, undated ones, and
            cancelled engagements are left out.
          </li>
          <li>
            The feed is <span className="text-ink">read-only</span>. Editing an entry inside your
            calendar app changes nothing in OrbitOS.
          </li>
        </ul>
      </DashboardCard>
    </div>
  );
}
