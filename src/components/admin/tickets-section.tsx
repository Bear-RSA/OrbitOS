"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, MessageSquareText, UserCheck, Wrench, XCircle } from "lucide-react";

import {
  adminTicketStepAction,
  applyTicketAction,
  listAllTicketsAction,
  type AdminTicketStep,
  type TicketView,
} from "@/app/actions/tickets";
import { TicketDialog, TicketRow, type TicketButton, type TicketOutcome } from "@/components/tickets/ticket-parts";
import { DialogNotice } from "@/components/ui/dialog-parts";
import { ADMIN_LOCKED_ERROR } from "@/lib/internal-management/rules";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Tickets, in Admin Tools                                            */
/*                                                                     */
/*  Every ticket in the workspace, wherever it sits. Ones on           */
/*  Internal Management's own desk come first; issues still climbing   */
/*  the ranks can be stepped in on. Onboarding, moves and offboarding  */
/*  have a one-click Apply that does the work and closes the ticket.   */
/* ------------------------------------------------------------------ */

type Filter = "desk" | "climbing" | "closed";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "desk", label: "On your desk" },
  { key: "climbing", label: "With the ranks" },
  { key: "closed", label: "Closed" },
];

function buttonsFor(ticket: TicketView): TicketButton[] {
  const buttons: TicketButton[] = [
    { key: "decline", label: "Decline", icon: XCircle, tone: "danger", needsNote: "Say why it's declined, so they know what to do next." },
    { key: "note", label: "Add note", icon: MessageSquareText, tone: "ghost", needsNote: "Write the note first." },
  ];
  if (ticket.holder) buttons.push({ key: "step_in", label: "Step in", icon: UserCheck, tone: "outline" });
  if (ticket.apply) buttons.push({ key: "apply", label: ticket.apply, icon: Wrench, tone: "outline" });
  buttons.push({ key: "resolve", label: "Resolve", icon: CheckCircle2 });
  return buttons;
}

export function TicketsSection({
  className,
  heading,
  onLocked,
}: {
  className?: string;
  heading: React.ReactNode;
  onLocked: () => void;
}) {
  const [tickets, setTickets] = useState<TicketView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("desk");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await listAllTicketsAction();
    if (!result.success) {
      if (result.error === ADMIN_LOCKED_ERROR) onLocked();
      else setError(result.error);
      setTickets([]);
      return;
    }
    setError(null);
    setTickets(result.tickets);
  }, [onLocked]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (ticketId: string, key: string, note: string): Promise<TicketOutcome> => {
      if (key === "apply") {
        const result = await applyTicketAction({ ticketId });
        if (!result.success) {
          if (result.error === ADMIN_LOCKED_ERROR) onLocked();
          return { error: result.error };
        }
        await load();
        return { message: result.message };
      }
      const result = await adminTicketStepAction({ ticketId, step: key as AdminTicketStep, note });
      if (!result.success) {
        if (result.error === ADMIN_LOCKED_ERROR) onLocked();
        return { error: result.error };
      }
      await load();
      return {};
    },
    [load, onLocked]
  );

  const counts = useMemo(() => {
    const all = tickets ?? [];
    return {
      desk: all.filter((t) => t.status === "OPEN" && !t.holder),
      climbing: all.filter((t) => t.status === "OPEN" && t.holder),
      closed: all.filter((t) => t.status !== "OPEN"),
    };
  }, [tickets]);

  const shown = counts[filter];
  const selected = tickets?.find((t) => t.id === openId) ?? null;

  return (
    <section className={cn(className, "flex flex-col gap-4")}>
      {heading}
      <p className="max-w-2xl text-[13px] leading-relaxed text-ink-dim">
        Every ticket in the workspace. Issues climb from Team Lead to Owner before they reach you, and you can step in on any
        of them. Onboarding, moves and offboarding come straight here.
      </p>

      <div role="tablist" aria-label="Which tickets" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] ring-1 ring-inset transition-colors duration-quick",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              filter === f.key ? "bg-surface-control text-ink ring-line/[0.1]" : "text-ink-muted ring-transparent hover:text-ink"
            )}
          >
            {f.label}
            <span className="ml-2 font-mono text-[11px] tabular-nums text-ink-dim">{counts[f.key].length}</span>
          </button>
        ))}
      </div>

      {error && <DialogNotice tone="red">{error}</DialogNotice>}

      {tickets === null ? (
        <p className="py-3 text-[12px] text-ink-dim">Loading tickets…</p>
      ) : shown.length === 0 ? (
        <p className="py-3 text-[12px] text-ink-dim">
          {filter === "desk" ? "Nothing on your desk." : filter === "climbing" ? "No issues are with the ranks right now." : "No closed tickets yet."}
        </p>
      ) : (
        <ul className="-mx-3 flex flex-col">
          {shown.map((t) => (
            <TicketRow key={t.id} ticket={t} onOpen={() => setOpenId(t.id)} />
          ))}
        </ul>
      )}

      <TicketDialog
        ticket={selected}
        onClose={() => setOpenId(null)}
        buttons={selected ? buttonsFor(selected) : []}
        onAction={(key, note) => act(selected!.id, key, note)}
      />
    </section>
  );
}
