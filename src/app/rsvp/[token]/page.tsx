"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Loader } from "@/components/ui/loader";
import { CallRoom } from "@/components/calls/call-room";
import { AlertCircle, Calendar, Check, Clock, Link2, MapPin, Video, X } from "lucide-react";
import {
  getRsvpContextAction,
  joinScheduledCallAsGuestAction,
  submitTokenRsvpAction,
  type RsvpContext,
} from "@/app/actions/rsvp";
import { vetDisplayName } from "@/lib/calls/display-name";
import type { CallGrant } from "@/types/call";
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

  /* Joining the call, for a guest whose engagement is hosted here. The
     name starts as the one the organizer typed and is theirs to correct
     — it is what the room will see. */
  const [joinName, setJoinName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [grant, setGrant] = useState<CallGrant | null>(null);

  const joinCall = async (event: React.FormEvent) => {
    event.preventDefault();

    const checked = vetDisplayName(joinName);
    if (checked.error) {
      setJoinError(checked.error);
      return;
    }

    setJoining(true);
    setJoinError(null);

    const result = await joinScheduledCallAsGuestAction({ token, fullName: checked.name! });
    if (result.success) setGrant(result.grant);
    else setJoinError(result.error);

    setJoining(false);
  };

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
      setJoinName(result.data.subjectName);
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

  /* In the room. The invitation card gives way to the call itself; leaving
     brings the card back, answer and all. */
  if (grant) {
    return (
      <div className="flex min-h-screen flex-col bg-base p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
            {context.title} · {grant.displayName}
          </p>
          <button
            type="button"
            onClick={() => setGrant(null)}
            className="rounded-lg border border-line/[0.06] bg-surface-control px-3 py-1.5 text-[11px] tracking-wide text-ink transition-colors hover:bg-surface-raised"
          >
            Leave
          </button>
        </div>
        <CallRoom grant={grant} onLeave={() => setGrant(null)} className="min-h-0 flex-1" />
      </div>
    );
  }

  const orbitCall = context.callProvider === "orbit" && !context.cancelled;

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

            {orbitCall ? (
              <div className="flex gap-3 items-start">
                <Video className="w-4 h-4 text-ink-dim mt-0.5 shrink-0" />
                <dd className="text-[13px] text-ink font-light leading-relaxed">
                  Hosted in OrbitOS
                  <span className="block text-[11px] text-ink-dim mt-0.5">
                    {context.subjectKind === "guest"
                      ? "Join from this page when it starts — no account needed."
                      : "Open OrbitOS and join from your calendar."}
                  </span>
                </dd>
              </div>
            ) : (
              context.meetingUrl &&
              !context.cancelled && (
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
              )
            )}
          </dl>

          {/* The way in. A guest joins by name from here — the signed link
              is their credential, the same one that lets them reply. A
              member is sent into the app, where their pass carries room
              rights that have no business riding on a forwardable link. */}
          {orbitCall && (
            <div className="mb-8 rounded-2xl bg-surface-control/60 p-5 ring-1 ring-inset ring-line/[0.05]">
              {context.subjectKind === "guest" ? (
                <form onSubmit={joinCall}>
                  <label
                    htmlFor="join-name"
                    className="mb-2 block text-[12px] font-light text-ink-muted"
                  >
                    Your name in the call
                  </label>
                  <input
                    id="join-name"
                    value={joinName}
                    onChange={(e) => {
                      setJoinName(e.target.value);
                      if (joinError) setJoinError(null);
                    }}
                    autoComplete="name"
                    className="mb-3 w-full rounded-xl border border-line/[0.06] bg-surface-sunken px-4 py-3 text-[13px] font-light text-ink outline-none transition-colors focus:border-line/20"
                  />
                  <button
                    type="submit"
                    disabled={joining}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-[13px] font-medium tracking-wide text-on-ink transition-opacity disabled:opacity-40"
                  >
                    <Video className="h-4 w-4" aria-hidden />
                    {joining ? "Connecting…" : "Join the call"}
                  </button>
                  {joinError && (
                    <p className="mt-3 text-[12px] font-light text-orbit-red">{joinError}</p>
                  )}
                  <p className="mt-3 text-[11px] font-light leading-relaxed text-ink-dim">
                    Opens ten minutes before the start.
                  </p>
                </form>
              ) : (
                context.meetingUrl && (
                  <a
                    href={context.meetingUrl}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-[13px] font-medium tracking-wide text-on-ink transition-opacity hover:opacity-90"
                  >
                    <Video className="h-4 w-4" aria-hidden />
                    Open in OrbitOS
                  </a>
                )
              )}
            </div>
          )}

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
