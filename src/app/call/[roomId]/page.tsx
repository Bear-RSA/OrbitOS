"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { CallRoom } from "@/components/calls/call-room";
import { Loader } from "@/components/ui/loader";
import { useAuth } from "@/contexts/auth-context";
import { useCall } from "@/contexts/call-context";
import { walkInToScheduledCallAction } from "@/app/actions/calls";
import { vetDisplayName } from "@/lib/calls/display-name";
import { roomIdSchema } from "@/lib/validations/call";
import type { CallGrant } from "@/types/call";

/* ------------------------------------------------------------------ */
/*  A call's front door                                                */
/*                                                                     */
/*  This is where the link in an invitation lands. Everyone arrives    */
/*  here holding the same URL, and the page decides which of two       */
/*  people it is looking at:                                           */
/*                                                                     */
/*    - a MEMBER, signed in. They are handed to the call session and   */
/*      sent to the dashboard, where the room opens over the app the   */
/*      way it does from the calendar — so the call survives whatever  */
/*      they click during it, and so a person who opened the link in   */
/*      their inbox ends up in the same place as one who clicked Join. */
/*                                                                     */
/*    - a WALK-IN, with no session. The link was forwarded or pasted.  */
/*      They type a name and are let in only while a member is already */
/*      inside — the server's rule, not this page's; see `canWalkIn`.  */
/*                                                                     */
/*  An invited guest is not a third case here. Their invitation links  */
/*  to the RSVP page, which knows who they are and lets them in by     */
/*  name from there.                                                   */
/* ------------------------------------------------------------------ */

export default function ScheduledCallPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const { user, loading, sessionStatus } = useAuth();
  const { joinScheduledCall } = useCall();

  /* Shape-checked before it goes anywhere near a server action. Held as
     a string rather than the parse result so the effect below keys on
     the id itself, not on a fresh object every render. */
  const parsed = roomIdSchema.safeParse(params?.roomId);
  const roomId = parsed.success ? parsed.data : null;

  const [name, setName] = useState("");
  const [grant, setGrant] = useState<CallGrant | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMember = Boolean(user?.orgId);

  /* A member is not joined from this page. The room is a piece of
     session state that lives above the router, so the page hands the
     room over and gets out of the way. Waits for the session cookie —
     the join is a server action, and one fired before the cookie lands
     is refused as signed out.

     ONCE. `joinScheduledCall` is rebuilt whenever the call session
     changes — including when this very handoff opens the room, and
     again when the person hangs up — and an effect that re-ran on it
     would put them straight back into the call they just left, while
     restarting the navigation each time. The ref is what makes hanging
     up mean hanging up. */
  const handedOff = useRef(false);

  useEffect(() => {
    if (handedOff.current) return;
    if (!roomId || loading || !isMember || sessionStatus !== "ready") return;
    handedOff.current = true;
    joinScheduledCall(roomId, "Scheduled call");
    router.replace("/dashboard");
  }, [roomId, loading, isMember, sessionStatus, joinScheduledCall, router]);

  async function enter(event: React.FormEvent) {
    event.preventDefault();
    if (!roomId) return;

    const checked = vetDisplayName(name);
    if (checked.error) {
      setError(checked.error);
      return;
    }

    setJoining(true);
    setError(null);

    const result = await walkInToScheduledCallAction({
      roomId,
      fullName: checked.name!,
    });
    if (result.success) {
      setGrant(result.grant);
      setTitle(result.title);
    } else {
      setError(result.error);
    }

    setJoining(false);
  }

  if (!roomId) {
    return (
      <Frame eyebrow="Not a call">
        <p className="text-[13px] font-light leading-relaxed text-ink-muted">
          This link does not point at a call. Check the invitation it came from.
        </p>
      </Frame>
    );
  }

  /* Signed in, or still finding out. Either way the walk-in form is the
     wrong thing to show a member for the half-second before the redirect. */
  if (loading || isMember) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-base">
        <Loader />
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">
          Opening the room
        </span>
      </div>
    );
  }

  if (grant) {
    return (
      <div className="flex min-h-screen flex-col bg-base p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
            {title ?? "Call"} · {grant.displayName}
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

  return (
    <Frame eyebrow="You have been sent a call link">
      <form onSubmit={enter}>
        <h1 className="mb-8 text-[22px] font-light tracking-tight text-ink">Join the call</h1>

        <label htmlFor="walk-in-name" className="mb-2 block text-[12px] font-light text-ink-muted">
          Your full name
        </label>
        <input
          id="walk-in-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="As the room should see it"
          autoComplete="name"
          autoFocus
          className="mb-6 w-full rounded-xl border border-line/[0.06] bg-surface-control px-4 py-3 text-[13px] font-light text-ink outline-none transition-colors focus:border-line/20"
        />

        <button
          type="submit"
          disabled={joining}
          className="w-full rounded-xl bg-ink px-4 py-3 text-[13px] font-medium tracking-wide text-on-ink transition-opacity disabled:opacity-40"
        >
          {joining ? "Connecting…" : "Enter the room"}
        </button>

        {error && <p className="mt-6 text-[12px] font-light text-orbit-red">{error}</p>}

        <p className="mt-8 text-[11px] font-light leading-relaxed text-ink-dim">
          You will be shown as a guest. The room opens once someone from the
          workspace is in it.{" "}
          <Link href="/login" className="text-ink-muted underline-offset-4 hover:underline">
            Part of this workspace? Sign in
          </Link>{" "}
          and join from your calendar instead.
        </p>
      </form>
    </Frame>
  );
}

/** The card the sign-in-shaped screens share. */
function Frame({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base p-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="w-full rounded-[40px] border border-outline-variant/10 bg-surface-container/95 p-10 shadow-overlay backdrop-blur-2xl sm:p-12">
          <Logo className="mb-10" />
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim">
            {eyebrow}
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}
