"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CheckCircle2, MessageSquareText, Plus, Undo2 } from "lucide-react";

import { getTicketsAction, ticketStepAction, type TicketForm, type TicketStep, type TicketView } from "@/app/actions/tickets";
import { OrbitLoader } from "@/components/brand/orbit-loader";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AppHeader } from "@/components/nav/app-header";
import { NewTicketDialog } from "@/components/tickets/new-ticket-dialog";
import { TicketDialog, TicketRow, type TicketButton, type TicketOutcome } from "@/components/tickets/ticket-parts";
import { Button } from "@/components/ui/button";
import { DialogNotice } from "@/components/ui/dialog-parts";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  /tickets                                                           */
/*                                                                     */
/*  Everyone's: what is waiting on you, what you raised, and what has  */
/*  passed through your hands. Internal Management works the whole     */
/*  queue from Admin Tools; this page shows them only their own.       */
/* ------------------------------------------------------------------ */

function buttonsFor(ticket: TicketView): TicketButton[] {
  const buttons: TicketButton[] = [];
  if (ticket.can.withdraw) buttons.push({ key: "withdraw", label: "Withdraw", icon: Undo2, tone: "danger" });
  if (ticket.can.note) buttons.push({ key: "note", label: "Add note", icon: MessageSquareText, tone: "ghost", needsNote: "Write the note first." });
  if (ticket.can.escalate && ticket.escalatesTo) {
    buttons.push({ key: "escalate", label: `Escalate to ${ticket.escalatesTo}`, icon: ArrowUpRight, tone: "outline" });
  }
  if (ticket.can.resolve) buttons.push({ key: "resolve", label: "Resolve", icon: CheckCircle2 });
  return buttons;
}

export default function TicketsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [tickets, setTickets] = useState<TicketView[] | null>(null);
  const [form, setForm] = useState<TicketForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [raising, setRaising] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  const load = useCallback(async () => {
    const result = await getTicketsAction();
    if (!result.success) {
      setError(result.error);
      setTickets([]);
      return;
    }
    setError(null);
    setTickets(result.tickets);
    setForm(result.form);
  }, []);

  useEffect(() => {
    if (user?.orgId) void load();
  }, [user?.orgId, load]);

  const act = useCallback(
    async (ticketId: string, key: string, note: string): Promise<TicketOutcome> => {
      const result = await ticketStepAction({ ticketId, step: key as TicketStep, note });
      if (!result.success) return { error: result.error };
      await load();
      return {};
    },
    [load]
  );

  const groups = useMemo(() => {
    const visible = (tickets ?? []).filter((t) => showClosed || t.status === "OPEN");
    return [
      { key: "holding", title: "Waiting on you", empty: "Nothing is waiting on you.", items: visible.filter((t) => t.relation === "holding") },
      { key: "raised", title: "Raised by you", empty: "You haven't raised anything.", items: visible.filter((t) => t.relation === "raised") },
      { key: "handled", title: "Passed on by you", empty: null, items: visible.filter((t) => t.relation === "handled") },
    ];
  }, [tickets, showClosed]);

  const selected = tickets?.find((t) => t.id === openId) ?? null;
  const closedCount = tickets?.filter((t) => t.status !== "OPEN").length ?? 0;

  if (loading || !user || tickets === null) {
    return (
      <div className="flex min-h-[100dvh] w-full items-center justify-center bg-ground">
        <OrbitLoader />
      </div>
    );
  }

  return (
    <DashboardShell className="min-h-screen bg-ground text-ink selection:bg-surface-hover selection:text-ink-strong">
      <AppHeader user={user} />

      <ScrollReveal>
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="mb-4 text-5xl font-light tracking-tighter text-ink">Tickets</h1>
            <p className="max-w-xl text-[13px] leading-relaxed text-ink-dim">
              Raise an issue and it starts with your Team Lead, who can take it up the ranks. Onboarding, moves, offboarding and
              access go straight to Internal Management.
            </p>
          </div>
          {form && (
            <Button onClick={() => setRaising(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New ticket
            </Button>
          )}
        </div>
      </ScrollReveal>

      {error && <DialogNotice tone="red" className="mb-6 max-w-xl">{error}</DialogNotice>}

      <div className="flex flex-col gap-6 pb-24">
        {groups.map((group) =>
          group.items.length === 0 && !group.empty ? null : (
            <section key={group.key} className="rounded-[28px] bg-surface-raised/40 p-5 ring-1 ring-inset ring-line/[0.05] sm:p-7">
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-light tracking-tight text-ink">
                {group.title}
                {group.items.length > 0 && (
                  <span className="font-mono text-[11px] tabular-nums text-ink-muted">{group.items.length}</span>
                )}
              </h2>
              {group.items.length === 0 ? (
                <p className="text-[13px] text-ink-dim">{group.empty}</p>
              ) : (
                <ul className="-mx-3 flex flex-col">
                  {group.items.map((t) => (
                    <TicketRow key={t.id} ticket={t} showRaiser={group.key !== "raised"} onOpen={() => setOpenId(t.id)} />
                  ))}
                </ul>
              )}
            </section>
          )
        )}

        {closedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className={cn("self-start rounded-full px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:text-ink")}
          >
            {showClosed ? "Hide closed tickets" : `Show ${closedCount} closed ticket${closedCount === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {form && <NewTicketDialog open={raising} onOpenChange={setRaising} form={form} onRaised={load} />}

      <TicketDialog
        ticket={selected}
        onClose={() => setOpenId(null)}
        buttons={selected ? buttonsFor(selected) : []}
        onAction={(key, note) => act(selected!.id, key, note)}
      />
    </DashboardShell>
  );
}
