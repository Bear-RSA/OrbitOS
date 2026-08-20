"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Loader } from "@/components/ui/loader";
import { AlertCircle, Calendar, Check, Clock, Link2, MapPin, X } from "lucide-react";
import {
  getRsvpContextAction,
  submitTokenRsvpAction,
  type RsvpContext,
} from "@/app/actions/rsvp";
import type { RsvpStatus } from "@/types/event";

/* ------------------------------------------------------------------ */
/*  Guest RSVP                                                         */
/*                                                                     */
/*  The only OrbitOS screen a person can reach with no account. It     */
/*  answers one question and asks for nothing — no sign-up wall, no    */
/*  "create an account to reply". A client invited to one meeting      */
/*  should be able to say yes in a single tap from their phone.        */
/*                                                                     */
/*  The email's Yes/Maybe/No buttons arrive here as `?reply=`, which   */
/*  is submitted on load so that click is the whole interaction. The   */
/*  buttons still render underneath, because a mail client that        */
/*  stripped the query string has to leave the person somewhere they   */
/*  can still answer.                                                  */
/* ------------------------------------------------------------------ */

const REPLIES: { value: RsvpStatus; label: string; icon: typeof Check }[] = [
  { value: "accepted", label: "Yes, I'll be there", icon: Check },
  { value: "tentative", label: "Maybe", icon: Clock },
  { value: "declined", label: "No, I can't make it", icon: X },
];

const CONFIRMATION: Record<RsvpStatus, string> = {
  accepted: "You're in. See you there.",
  tentative: "Marked as tentative — the organizer knows you're unsure.",
  declined: "You've declined. The organizer has been told.",
  pending: "Choose a response below.",
};

/** Renders the span in the engagement's own zone, not the reader's. */
function formatWhen(context: RsvpContext): string {
  const start = new Date(context.startAt);

  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: context.timeZone,
  }).format(start);

  if (context.allDay) return `${day} — all day`;

  const clock = (date: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: context.timeZone,
    }).format(date);

  return `${day}, ${clock(start)}–${clock(new Date(context.endAt))}`;
}

function isReply(value: string | null): value is RsvpStatus {
  return value === "accepted" || value === "declined" || value === "tentative";
}

export default function RsvpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const searchParams = useSearchParams();

  const [context, setContext] = useState<RsvpContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<RsvpStatus | null>(null);
  const [answered, setAnswered] = useState<RsvpStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (status: RsvpStatus) => {
      setSubmitting(status);
      setError(null);

      const result = await submitTokenRsvpAction(token, status);
      if (result.success) setAnswered(result.status);
      else setError(result.error);

      setSubmitting(null);
    },
    [token]
  );

  useEffect(() => {
    let active = true;

    getRsvpContextAction(token).then((result) => {
      if (!active) return;

      if (!result.success) {
        setError(result.error);
        setLoading(false);
        return;
      }

      setContext(result.data);
      if (result.data.current !== "pending") setAnswered(result.data.current);
      setLoading(false);

      /* The click already happened, in their inbox. Honour it rather than
         making them give the same answer a second time. */
      const reply = searchParams.get("reply");
      if (isReply(reply) && !result.data.cancelled) void submit(reply);
    });

    return () => {
      active = false;
    };
  }, [token, searchParams, submit]);

  if (loading) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center p-4">
        <Loader />
      </div>
    );
  }

  if (!context) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center p-4">
        <div className="w-full max-w-sm animate-fade-in text-center flex flex-col items-center">
          <div className="w-full rounded-[40px] bg-surface-container/95 border border-outline-variant/10 backdrop-blur-2xl shadow-overlay p-12">
            <div className="mx-auto w-12 h-12 rounded-full bg-orbit-red/[0.1] flex items-center justify-center mb-6">
              <AlertCircle className="w-5 h-5 text-orbit-red" />
            </div>
            <h1 className="text-[17px] font-light tracking-tight text-ink mb-2">
              Invitation unavailable
            </h1>
            <p className="text-[13px] text-ink-muted font-light leading-relaxed mb-8">
              {error}
            </p>
            <Link
              href="/"
              className="text-[12px] font-medium text-ink bg-surface-control px-5 py-2.5 rounded-lg border border-line/[0.04] hover:bg-surface-raised transition-all inline-block tracking-wide"
            >
              Go to OrbitOS
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="w-full rounded-[40px] bg-surface-container/95 border border-outline-variant/10 backdrop-blur-2xl shadow-overlay p-10 sm:p-12">
          <Logo className="mb-10" />

          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-ink-dim mb-3">
            {context.cancelled ? "Cancelled" : `${context.organizerName} invited you`}
          </p>

          <h1
            className={`text-[22px] font-light tracking-tight text-ink mb-8 ${
              context.cancelled ? "line-through opacity-50" : ""
            }`}
          >
            {context.title}
          </h1>

          <dl className="space-y-3.5 mb-8">
            <div className="flex gap-3 items-start">
              <Calendar className="w-4 h-4 text-ink-dim mt-0.5 shrink-0" />
              <dd className="text-[13px] text-ink font-light leading-relaxed">
                {formatWhen(context)}
                <span className="block text-[11px] text-ink-dim mt-0.5">
                  {context.timeZone}
                </span>
              </dd>
            </div>

            {context.location && (
              <div className="flex gap-3 items-start">
                <MapPin className="w-4 h-4 text-ink-dim mt-0.5 shrink-0" />
                <dd className="text-[13px] text-ink font-light leading-relaxed">
                  {context.location}
                </dd>
              </div>
            )}

            {context.meetingUrl && !context.cancelled && (
              <div className="flex gap-3 items-start">
                <Link2 className="w-4 h-4 text-ink-dim mt-0.5 shrink-0" />
                <dd className="text-[13px] font-light leading-relaxed">
                  <a
                    href={context.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orbit-blue hover:underline underline-offset-4 break-all"
                  >
                    {context.meetingUrl}
                  </a>
                </dd>
              </div>
            )}
          </dl>

          {context.description && (
            <p className="text-[13px] text-ink-muted font-light leading-relaxed border-l border-line/[0.08] pl-4 mb-8 whitespace-pre-wrap">
              {context.description}
            </p>
          )}

          {context.cancelled ? (
            <p className="text-[13px] text-ink-muted font-light leading-relaxed">
              This engagement was cancelled. Nothing is required from you.
            </p>
          ) : (
            <>
              <p className="text-[12px] text-ink-dim font-light mb-4">
                Replying as <span className="text-ink">{context.subjectName}</span>
                {context.subjectKind === "guest" && " · guest"}
              </p>

              <div className="space-y-2">
                {REPLIES.map(({ value, label, icon: Icon }) => {
                  const active = answered === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => submit(value)}
                      disabled={submitting !== null}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-[13px] text-left tracking-wide transition-all disabled:opacity-40 ${
                        active
                          ? "border-transparent bg-ink text-on-ink font-medium"
                          : "border-line/[0.06] bg-surface-control text-ink font-light hover:bg-surface-raised"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {label}
                      {submitting === value && (
                        <span className="ml-auto text-[11px] opacity-60">Saving…</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {answered && !submitting && (
                <p className="text-[12px] text-orbit-green font-light mt-6">
                  {CONFIRMATION[answered]}
                </p>
              )}

              {error && (
                <p className="text-[12px] text-orbit-red font-light mt-6">{error}</p>
              )}

              <p className="text-[11px] text-ink-dim font-light leading-relaxed mt-8">
                You can change your answer any time by reopening this link.
              </p>
            </>
          )}

          <p className="text-[11px] text-ink-dim font-light mt-10 pt-6 border-t border-line/[0.04]">
            Sent by {context.orgName || "an OrbitOS workspace"}.
          </p>
        </div>
      </div>
    </div>
  );
}
