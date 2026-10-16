"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Mail, RotateCw, Send, X } from "lucide-react";

import {
  createInviteAction,
  listPendingInvitesAction,
  resendInviteAction,
  revokeInviteAction,
  type PendingInvite,
} from "@/app/actions/invites";
import { Button } from "@/components/ui/button";
import { DialogNotice } from "@/components/ui/dialog-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_LOCKED_ERROR } from "@/lib/internal-management/rules";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Invites, in Admin Tools                                            */
/*                                                                     */
/*  The only place anyone is brought into the workspace. Sending,      */
/*  then everything still waiting: copy the link, send it again with   */
/*  a fresh seven days, or withdraw it. Every action re-checks the     */
/*  Admin Tools unlock on the server.                                  */
/* ------------------------------------------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000;

type Notice = { tone: "green" | "amber" | "red"; text: string } | null;

function expiryLabel(invite: PendingInvite): string {
  if (invite.expired) return "Expired";
  const days = Math.ceil((new Date(invite.expiresAt).getTime() - Date.now()) / DAY_MS);
  if (days <= 1) return "Expires within a day";
  return `Expires in ${days} days`;
}

export function InvitesSection({
  className,
  heading,
  onLocked,
}: {
  className?: string;
  heading: React.ReactNode;
  onLocked: () => void;
}) {
  const [invites, setInvites] = useState<PendingInvite[] | null>(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // Which row is busy, and with what: "resend-<id>" or "revoke-<id>".
  const [busy, setBusy] = useState<string | null>(null);
  // The row asking "withdraw this invite?" before it does.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  /** Relocks on the locked error; otherwise returns the message to show. */
  const failed = useCallback(
    (error: string): Notice => {
      if (error === ADMIN_LOCKED_ERROR) {
        onLocked();
        return null;
      }
      return { tone: "red", text: error };
    },
    [onLocked]
  );

  const load = useCallback(async () => {
    const result = await listPendingInvitesAction();
    if (!result.success) {
      setNotice(failed(result.error));
      setInvites([]);
      return;
    }
    setInvites(result.invites);
  }, [failed]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    setSending(true);
    setNotice(null);
    const result = await createInviteAction({ email: address });
    setSending(false);
    if (!result.success) {
      setNotice(failed(result.error ?? "Couldn't create the invite. Try again."));
      return;
    }
    setEmail("");
    setNotice(
      result.emailSent
        ? { tone: "green", text: `Invite sent to ${result.email}.` }
        : {
            tone: "amber",
            text: `The invite for ${result.email} is ready, but the email didn't send. Copy its link below and send it yourself.`,
          }
    );
    await load();
  };

  const copy = async (invite: PendingInvite) => {
    try {
      await navigator.clipboard.writeText(invite.inviteLink);
      setCopied(invite.id);
      setTimeout(() => setCopied((c) => (c === invite.id ? null : c)), 2000);
    } catch {
      setNotice({ tone: "amber", text: "Couldn't copy. Your browser blocked the clipboard." });
    }
  };

  const resend = async (invite: PendingInvite) => {
    setBusy(`resend-${invite.id}`);
    setNotice(null);
    const result = await resendInviteAction({ inviteId: invite.id });
    setBusy(null);
    if (!result.success) {
      setNotice(failed(result.error));
      return;
    }
    setNotice(
      result.emailSent
        ? { tone: "green", text: `Sent again to ${invite.email}. The link works for another 7 days.` }
        : {
            tone: "amber",
            text: `The link for ${invite.email} works for another 7 days, but the email didn't send. Copy the link and send it yourself.`,
          }
    );
    await load();
  };

  const revoke = async (invite: PendingInvite) => {
    setBusy(`revoke-${invite.id}`);
    setNotice(null);
    const result = await revokeInviteAction({ inviteId: invite.id });
    setBusy(null);
    setConfirming(null);
    if (!result.success) {
      setNotice(failed(result.error));
      return;
    }
    setNotice({ tone: "green", text: `Withdrew the invite for ${invite.email}. Its link no longer works.` });
    await load();
  };

  const pendingCount = invites?.length ?? 0;

  return (
    <section className={cn(className, "flex flex-col gap-4")}>
      {heading}
      <p className="max-w-2xl text-[13px] leading-relaxed text-ink-dim">
        Only Internal Management brings people into the workspace. Each link works for 7 days, and only for the
        address it was sent to.
      </p>

      <form onSubmit={send} className="flex flex-col gap-2.5 sm:max-w-xl">
        <Label htmlFor="admin-invite-email">Email address</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Mail
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim"
              aria-hidden
            />
            <Input
              id="admin-invite-email"
              type="email"
              required
              autoComplete="off"
              placeholder="name@studio.co.za"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sending}
              className="pl-11"
            />
          </div>
          <Button type="submit" isLoading={sending} disabled={sending || !email.trim()}>
            {!sending && <Send className="h-3.5 w-3.5" aria-hidden />}
            {sending ? "Sending…" : "Send invite"}
          </Button>
        </div>
      </form>

      {notice && (
        <DialogNotice tone={notice.tone}>
          <span role={notice.tone === "red" ? undefined : "status"}>{notice.text}</span>
        </DialogNotice>
      )}

      <div className="flex flex-col gap-1 pt-2">
        <h3 className="text-[13px] text-ink">
          Waiting to join
          {pendingCount > 0 && <span className="ml-2 font-mono text-[11px] tabular-nums text-ink-muted">{pendingCount}</span>}
        </h3>

        {invites === null ? (
          <p className="py-3 text-[12px] text-ink-dim">Loading invites…</p>
        ) : invites.length === 0 ? (
          <p className="py-3 text-[12px] text-ink-dim">No one is waiting. New invites show here until they&apos;re accepted.</p>
        ) : (
          <ul className="divide-y divide-line/[0.06]">
            {invites.map((invite) => {
              const rowBusy = busy !== null && busy.endsWith(invite.id);
              return (
                <li key={invite.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="truncate text-[14px] text-ink">{invite.email}</p>
                    <p className="truncate text-[12px] text-ink-dim">
                      Sent by {invite.inviterName} ·{" "}
                      <span className={invite.expired ? "text-orbit-amber" : undefined}>{expiryLabel(invite)}</span>
                    </p>
                  </div>

                  {confirming === invite.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-ink-muted">Withdraw this invite?</span>
                      <Button
                        variant="ghost"
                        className="text-orbit-red hover:bg-orbit-red/10 hover:text-orbit-red"
                        isLoading={busy === `revoke-${invite.id}`}
                        disabled={rowBusy}
                        onClick={() => revoke(invite)}
                      >
                        Withdraw
                      </Button>
                      <Button variant="ghost" disabled={rowBusy} onClick={() => setConfirming(null)}>
                        Keep
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1">
                      {!invite.expired && (
                        <Button variant="ghost" onClick={() => copy(invite)} disabled={rowBusy}>
                          {copied === invite.id ? (
                            <Check className="h-3.5 w-3.5 text-orbit-green" aria-hidden />
                          ) : (
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                          )}
                          {copied === invite.id ? "Copied" : "Copy link"}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        isLoading={busy === `resend-${invite.id}`}
                        disabled={rowBusy}
                        onClick={() => resend(invite)}
                      >
                        {busy !== `resend-${invite.id}` && <RotateCw className="h-3.5 w-3.5" aria-hidden />}
                        Resend
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-orbit-red hover:bg-orbit-red/10 hover:text-orbit-red"
                        disabled={rowBusy}
                        onClick={() => setConfirming(invite.id)}
                        aria-label={`Withdraw the invite for ${invite.email}`}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                        Withdraw
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
