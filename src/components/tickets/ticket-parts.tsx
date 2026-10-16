"use client";

import { useState } from "react";
import { ArrowUpRight, CheckCircle2, CircleDot, MessageSquareText, Undo2, UserCheck, Wrench, XCircle, type LucideIcon } from "lucide-react";

import type { TicketView } from "@/app/actions/tickets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DialogHeading, DialogNotice, DIALOG_FOOTER_CLASS } from "@/components/ui/dialog-parts";
import { Textarea } from "@/components/ui/textarea";
import { TICKET_STATUS_LABEL, TICKET_TYPE_LABEL, type TicketStatus } from "@/lib/tickets/rules";
import type { TrailKind } from "@/lib/tickets/store";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Ticket rows and the ticket dialog                                  */
/*                                                                     */
/*  Shared by /tickets and the queue in Admin Tools. Each screen says  */
/*  which buttons the dialog shows; the server decides whether they    */
/*  work.                                                              */
/* ------------------------------------------------------------------ */

const STATUS_TONE: Record<TicketStatus, string> = {
  OPEN: "text-orbit-amber",
  RESOLVED: "text-orbit-green",
  DECLINED: "text-orbit-red",
  WITHDRAWN: "text-ink-dim",
};

const TRAIL_ICON: Record<TrailKind, LucideIcon> = {
  RAISED: CircleDot,
  ESCALATED: ArrowUpRight,
  STEPPED_IN: UserCheck,
  NOTE: MessageSquareText,
  APPLIED: Wrench,
  RESOLVED: CheckCircle2,
  DECLINED: XCircle,
  WITHDRAWN: Undo2,
};

const TRAIL_VERB: Record<TrailKind, string> = {
  RAISED: "raised it",
  ESCALATED: "escalated it",
  STEPPED_IN: "stepped in",
  NOTE: "added a note",
  APPLIED: "applied it",
  RESOLVED: "resolved it",
  DECLINED: "declined it",
  WITHDRAWN: "withdrew it",
};

export function timeAgo(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Where the ticket sits, in a few words. */
export function whereItSits(ticket: TicketView): string {
  if (ticket.status !== "OPEN") return TICKET_STATUS_LABEL[ticket.status];
  return ticket.holder ? `With ${ticket.holder.name}` : "With Internal Management";
}

export function TicketRow({ ticket, onOpen, showRaiser = true }: { ticket: TicketView; onOpen: () => void; showRaiser?: boolean }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-3 py-3 text-left",
          "transition-colors duration-quick hover:bg-surface-control/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        )}
      >
        <span className="min-w-0 flex-1 basis-56">
          <span className={cn("block truncate text-[14px]", ticket.status === "OPEN" ? "text-ink" : "text-ink-muted")}>
            {ticket.title}
          </span>
          <span className="block truncate text-[12px] text-ink-dim">
            {TICKET_TYPE_LABEL[ticket.type]}
            {showRaiser && ` · from ${ticket.raisedBy.name}`} · {timeAgo(ticket.updatedAt)}
          </span>
        </span>
        <span className={cn("shrink-0 text-[12px]", STATUS_TONE[ticket.status])}>{whereItSits(ticket)}</span>
      </button>
    </li>
  );
}

export interface TicketButton {
  key: string;
  label: string;
  icon: LucideIcon;
  tone?: "default" | "outline" | "ghost" | "danger";
  /** Refused with this message when the note box is empty. */
  needsNote?: string;
}

export type TicketOutcome = { error: string } | { message?: string };

export function TicketDialog({
  ticket,
  onClose,
  buttons,
  onAction,
}: {
  ticket: TicketView | null;
  onClose: () => void;
  buttons: TicketButton[];
  /** Runs a button. Return an error, or an optional message to show. */
  onAction: (key: string, note: string) => Promise<TicketOutcome>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "red" | "green"; text: string } | null>(null);

  const close = () => {
    setNote("");
    setNotice(null);
    onClose();
  };

  const run = async (button: TicketButton) => {
    if (button.needsNote && !note.trim()) {
      setNotice({ tone: "red", text: button.needsNote });
      return;
    }
    setBusy(button.key);
    setNotice(null);
    const outcome = await onAction(button.key, note);
    setBusy(null);
    if ("error" in outcome) {
      setNotice({ tone: "red", text: outcome.error });
      return;
    }
    setNote("");
    if (outcome.message) setNotice({ tone: "green", text: outcome.message });
  };

  const open = ticket?.status === "OPEN";

  return (
    <Dialog open={ticket !== null} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {ticket && (
          <>
            <DialogHeading
              icon={TRAIL_ICON.RAISED}
              tone={open ? "amber" : ticket.status === "RESOLVED" ? "green" : "neutral"}
              title={ticket.title}
              description={`${TICKET_TYPE_LABEL[ticket.type]} from ${ticket.raisedBy.name} · ${whereItSits(ticket)}`}
            />

            {ticket.facts.length > 0 && (
              <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-2xl bg-surface-control/40 px-4 py-3 text-[13px]">
                {ticket.facts.map((fact) => (
                  <div key={fact.label} className="contents">
                    <dt className="text-ink-dim">{fact.label}</dt>
                    <dd className="min-w-0 break-words text-ink">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {ticket.details && (
              <p className="mb-6 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{ticket.details}</p>
            )}

            <h3 className="mb-2 text-[12px] uppercase tracking-wide text-ink-dim">History</h3>
            <ol className="mb-2 flex flex-col gap-3">
              {ticket.trail.map((step, i) => {
                const Icon = TRAIL_ICON[step.kind];
                return (
                  <li key={`${step.at}-${i}`} className="flex gap-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-dim" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-ink">
                        {step.byName} {TRAIL_VERB[step.kind]}
                        <span className="ml-2 text-[12px] text-ink-dim">{timeAgo(step.at)}</span>
                      </p>
                      {step.text && <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted">{step.text}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>

            {notice && (
              <DialogNotice tone={notice.tone} className="mt-4">
                {notice.text}
              </DialogNotice>
            )}

            {open && buttons.length > 0 && (
              <div className={cn(DIALOG_FOOTER_CLASS, "flex flex-col gap-3")}>
                <Textarea
                  aria-label="Note"
                  placeholder="Add a note (optional unless the button asks for one)"
                  value={note}
                  maxLength={4000}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={busy !== null}
                  className="min-h-[80px] px-4 py-3"
                />
                <div className="flex flex-wrap justify-end gap-2">
                  {buttons.map((button) => {
                    const Icon = button.icon;
                    const danger = button.tone === "danger";
                    return (
                      <Button
                        key={button.key}
                        variant={danger ? "ghost" : button.tone === "outline" ? "outline" : button.tone === "ghost" ? "ghost" : "default"}
                        className={danger ? "text-orbit-red hover:bg-orbit-red/10 hover:text-orbit-red" : undefined}
                        disabled={busy !== null}
                        isLoading={busy === button.key}
                        onClick={() => run(button)}
                      >
                        {busy !== button.key && <Icon className="h-3.5 w-3.5" aria-hidden />}
                        {button.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
