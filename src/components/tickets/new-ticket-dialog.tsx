"use client";

import { useState } from "react";
import { Send, Ticket } from "lucide-react";

import { raiseTicketAction, type TicketForm } from "@/app/actions/tickets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DialogHeading, DialogNotice, DIALOG_FOOTER_CLASS } from "@/components/ui/dialog-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RANK_LABEL } from "@/lib/members/rank";
import { ACCESS_KIND_LABEL, TICKET_TYPE_LABEL, type AccessKind, type TicketType } from "@/lib/tickets/rules";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  New ticket                                                         */
/*                                                                     */
/*  One form, its fields following the type. Issues say where they    */
/*  go first (your Team Lead); everything else says Internal           */
/*  Management. The server checks every field again.                   */
/* ------------------------------------------------------------------ */

const TYPE_HINT: Record<TicketType, string> = {
  ISSUE: "Goes to your Team Lead first. They can escalate it up the ranks.",
  ACCESS: "A rank, the Vault, a tool. Goes straight to Internal Management.",
  ONBOARDING: "A new hire's particulars. Internal Management sends the invite and places them.",
  INTERNAL_MOVE: "A promotion or transfer. Internal Management applies it.",
  OFFBOARDING: "Someone leaving. They won't see this ticket.",
};

const NONE = "__none";
const KEEP = "KEEP";

type Values = Record<string, string>;

export function NewTicketDialog({
  open,
  onOpenChange,
  form,
  onRaised,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: TicketForm;
  onRaised: () => void;
}) {
  const [type, setType] = useState<TicketType>("ISSUE");
  const [values, setValues] = useState<Values>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string) => (value: string) => setValues((v) => ({ ...v, [key]: value }));
  const field = (key: string) => values[key] ?? "";

  const reset = () => {
    setType("ISSUE");
    setValues({});
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const v = values;
    const department = (raw: string | undefined, fallback: string) => {
      const value = raw ?? fallback;
      return value === NONE ? null : value;
    };
    const payload: Record<string, unknown> = { type, details: v.details };
    if (type === "ISSUE") payload.subject = v.subject;
    if (type === "ACCESS") payload.access = v.access;
    if (type === "ONBOARDING") {
      Object.assign(payload, {
        fullName: v.fullName,
        email: v.email,
        jobTitle: v.jobTitle,
        rank: v.rank ?? "MEMBER",
        departmentId: department(v.departmentId, NONE),
        startDate: v.startDate,
      });
    }
    if (type === "INTERNAL_MOVE") {
      Object.assign(payload, {
        subjectUid: v.subjectUid,
        rank: v.rank ?? KEEP,
        departmentId: department(v.departmentId, KEEP),
        effectiveDate: v.effectiveDate,
      });
    }
    if (type === "OFFBOARDING") Object.assign(payload, { subjectUid: v.subjectUid, lastDay: v.lastDay });

    const result = await raiseTicketAction(payload);
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    reset();
    onOpenChange(false);
    onRaised();
  };

  const personSelect = (label: string) => (
    <Row label={label} id="ticket-subject">
      <Select value={field("subjectUid")} onValueChange={set("subjectUid")}>
        <SelectTrigger id="ticket-subject">
          <SelectValue placeholder="Choose someone" />
        </SelectTrigger>
        <SelectContent>
          {form.people.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Row>
  );

  const departmentSelect = (keepOption: boolean) => (
    <Row label="Department" id="ticket-department">
      <Select value={values.departmentId ?? (keepOption ? KEEP : NONE)} onValueChange={set("departmentId")}>
        <SelectTrigger id="ticket-department">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {keepOption && <SelectItem value={KEEP}>Stays the same</SelectItem>}
          <SelectItem value={NONE}>No department</SelectItem>
          {form.departments.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Row>
  );

  const rankSelect = (keepOption: boolean) => (
    <Row label={keepOption ? "New rank" : "Rank"} id="ticket-rank">
      <Select value={values.rank ?? (keepOption ? KEEP : "MEMBER")} onValueChange={set("rank")}>
        <SelectTrigger id="ticket-rank">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {keepOption && <SelectItem value={KEEP}>Stays the same</SelectItem>}
          {form.ranks.map((r) => (
            <SelectItem key={r} value={r}>
              {RANK_LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Row>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeading icon={Ticket} title="New ticket" description={TYPE_HINT[type]} />

        <form onSubmit={submit} className="flex flex-col gap-4">
          {form.types.length > 1 && (
            <div role="radiogroup" aria-label="Kind of ticket" className="flex flex-wrap gap-2">
              {form.types.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  onClick={() => {
                    setType(t);
                    setValues({});
                    setError(null);
                  }}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-[13px] ring-1 ring-inset transition-colors duration-quick",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                    type === t ? "bg-ink text-on-ink ring-transparent" : "text-ink-muted ring-line/[0.1] hover:text-ink"
                  )}
                >
                  {TICKET_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          )}

          {type === "ISSUE" && (
            <Row label="Subject" id="ticket-subject-line">
              <Input id="ticket-subject-line" maxLength={120} value={field("subject")} onChange={(e) => set("subject")(e.target.value)} />
            </Row>
          )}

          {type === "ACCESS" && (
            <Row label="What you need" id="ticket-access">
              <Select value={field("access")} onValueChange={set("access")}>
                <SelectTrigger id="ticket-access">
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACCESS_KIND_LABEL) as AccessKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {ACCESS_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          )}

          {type === "ONBOARDING" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Row label="Full name" id="ticket-name">
                  <Input id="ticket-name" maxLength={120} value={field("fullName")} onChange={(e) => set("fullName")(e.target.value)} />
                </Row>
                <Row label="Email for the invite" id="ticket-email">
                  <Input id="ticket-email" type="email" autoComplete="off" value={field("email")} onChange={(e) => set("email")(e.target.value)} />
                </Row>
                <Row label="Job title" id="ticket-job">
                  <Input id="ticket-job" maxLength={120} value={field("jobTitle")} onChange={(e) => set("jobTitle")(e.target.value)} />
                </Row>
                <Row label="Start date" id="ticket-start">
                  <Input id="ticket-start" type="date" value={field("startDate")} onChange={(e) => set("startDate")(e.target.value)} />
                </Row>
                {rankSelect(false)}
                {departmentSelect(false)}
              </div>
            </>
          )}

          {type === "INTERNAL_MOVE" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {personSelect("Who is moving")}
              <Row label="Takes effect" id="ticket-effective">
                <Input id="ticket-effective" type="date" value={field("effectiveDate")} onChange={(e) => set("effectiveDate")(e.target.value)} />
              </Row>
              {rankSelect(true)}
              {departmentSelect(true)}
            </div>
          )}

          {type === "OFFBOARDING" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {personSelect("Who is leaving")}
              <Row label="Last day" id="ticket-last-day">
                <Input id="ticket-last-day" type="date" value={field("lastDay")} onChange={(e) => set("lastDay")(e.target.value)} />
              </Row>
            </div>
          )}

          <Row label={type === "ISSUE" || type === "ACCESS" ? "Details" : "Anything else Internal Management should know"} id="ticket-details">
            <Textarea
              id="ticket-details"
              maxLength={4000}
              value={field("details")}
              onChange={(e) => set("details")(e.target.value)}
              className="min-h-[110px] px-4 py-3"
            />
          </Row>

          {error && <DialogNotice tone="red">{error}</DialogNotice>}

          <div className={cn(DIALOG_FOOTER_CLASS, "flex justify-end")}>
            <Button type="submit" isLoading={busy} disabled={busy}>
              {!busy && <Send className="h-3.5 w-3.5" aria-hidden />}
              Send ticket
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
