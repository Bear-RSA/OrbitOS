"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Mail health banner                                                 */
/*                                                                     */
/*  Scheduled mail fails where nobody is looking. The run knows, the   */
/*  Vercel log knows, and the person expecting the mail finds out by   */
/*  eventually noticing an absence — which took most of a day on       */
/*  2026-08-21, when an invalid Resend key silently swallowed four     */
/*  mails and the runs all reported success.                          */
/*                                                                     */
/*  So a failed run says so on the dashboard, where the owner already  */
/*  is. Nothing renders on a clean day: the component is invisible     */
/*  unless something is actually wrong, which is what keeps it worth   */
/*  reading when it does appear.                                       */
/*                                                                     */
/*  Owner-only, enforced server-side — /api/health/mail answers a      */
/*  member with an empty list rather than a 403, so a member simply    */
/*  never sees a banner.                                               */
/* ------------------------------------------------------------------ */

interface RunFailure {
  job: string;
  dayKey: string;
  status: "failed" | "degraded";
  emailsSent: number;
  emailsFailed: number;
  errors: string[];
  finishedAt: string;
}

/**
 * A guest invite Resend accepted but did not deliver. Distinct from
 * `RunFailure`: there is no "day" here, just one recipient and one reason,
 * reported by the delivery webhook well after the organizer's dialog
 * already closed on a false "sent".
 */
interface DeliveryFailure {
  messageId: string;
  type: "bounced" | "complained";
  recipientEmail: string;
  engagementId: string | null;
  reason: string | null;
  occurredAt: string;
}

/** The job names are internal; these are what they are to a reader. */
const JOB_LABELS: Record<string, string> = {
  "due-tomorrow": "Due-tomorrow reminders",
};

/**
 * Turns a provider error into the thing to do about it.
 *
 * Only for causes with a single unambiguous fix — anything else keeps the
 * provider's own wording, which is more useful than a guess.
 */
function remedyFor(errors: string[]): string | null {
  const text = errors.join(" ").toLowerCase();

  if (text.includes("api key") || text.includes("unauthorized")) {
    return "Resend is rejecting the API key. Set a valid RESEND_API_KEY in the Vercel project's environment variables, then redeploy — env vars only apply to new deployments.";
  }
  if (text.includes("domain") && text.includes("verif")) {
    return "Resend has not verified the sending domain. Check the DNS records for mail.orbit-os.co.za in the Resend dashboard.";
  }
  if (text.includes("rate")) {
    return "Resend rate-limited the run. It should clear on its own; if it repeats, the send waves need to be smaller.";
  }
  return null;
}

/** "bounced" -> "bounced", "complained" -> "were marked as spam" */
const DELIVERY_VERB: Record<DeliveryFailure["type"], string> = {
  bounced: "bounced",
  complained: "were marked as spam",
};

export function MailHealthBanner() {
  const [failures, setFailures] = useState<RunFailure[]>([]);
  const [deliveryFailures, setDeliveryFailures] = useState<DeliveryFailure[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [deliveryExpanded, setDeliveryExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Deliberately silent on error. A banner that cannot load its own data
    // must not become a second thing to worry about.
    fetch("/api/health/mail")
      .then((res) => (res.ok ? res.json() : { failures: [], deliveryFailures: [] }))
      .then((data) => {
        if (cancelled) return;
        setFailures(data.failures ?? []);
        setDeliveryFailures(data.deliveryFailures ?? []);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (failures.length === 0 && deliveryFailures.length === 0) return null;

  const totalRefused = failures.reduce((sum, f) => sum + f.emailsFailed, 0);
  const allErrors = failures.flatMap((f) => f.errors);
  const remedy = remedyFor(allErrors);
  const outage = failures.every((f) => f.status === "failed");

  return (
    <>
      {failures.length > 0 && (
        <div
          className={cn(
            "mb-8 rounded-xl border p-4 sm:p-5",
            outage
              ? "border-orbit-red/30 bg-orbit-red/5"
              : "border-orbit-red/20 bg-surface-sunken"
          )}
          role="status"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-orbit-red" />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-strong">
                {totalRefused} scheduled email
                {totalRefused === 1 ? "" : "s"} could not be sent
              </p>

              <p className="mt-1 text-sm text-ink-muted">
                {failures
                  .map((f) => `${JOB_LABELS[f.job] ?? f.job} (${f.dayKey})`)
                  .join(", ")}
              </p>

              {remedy && (
                <p className="mt-3 text-sm leading-relaxed text-ink">{remedy}</p>
              )}

              {allErrors.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setExpanded((open) => !open)}
                    className="mt-3 flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 transition-transform",
                        expanded && "rotate-180"
                      )}
                    />
                    {expanded ? "Hide" : "Show"} what the mail service said
                  </button>

                  {expanded && (
                    <ul className="mt-2 space-y-1">
                      {allErrors.map((error, index) => (
                        <li
                          key={index}
                          className="break-words font-mono text-[11px] text-ink-muted"
                        >
                          {error}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {deliveryFailures.length > 0 && (
        <div
          className="mb-8 rounded-xl border border-orbit-red/20 bg-surface-sunken p-4 sm:p-5"
          role="status"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-orbit-red" />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-strong">
                {deliveryFailures.length} engagement invite
                {deliveryFailures.length === 1 ? "" : "s"} did not reach the recipient
              </p>

              <p className="mt-1 text-sm text-ink-muted">
                Resend accepted these — the failure only showed up afterward.
              </p>

              <button
                type="button"
                onClick={() => setDeliveryExpanded((open) => !open)}
                className="mt-3 flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink"
              >
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    deliveryExpanded && "rotate-180"
                  )}
                />
                {deliveryExpanded ? "Hide" : "Show"} who was affected
              </button>

              {deliveryExpanded && (
                <ul className="mt-2 space-y-1">
                  {deliveryFailures.map((failure) => (
                    <li
                      key={failure.messageId}
                      className="break-words font-mono text-[11px] text-ink-muted"
                    >
                      {failure.recipientEmail} {DELIVERY_VERB[failure.type]}
                      {failure.reason ? `: ${failure.reason}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
