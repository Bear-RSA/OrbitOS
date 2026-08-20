"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import {
  createEventAction,
  getEngagementGuestsAction,
  updateEventAction,
  type InviteOutcome,
} from "@/app/actions/events";
import { Member } from "@/types/member";
import type { OrbitEvent } from "@/types/event";
import {
  DURATIONS,
  EMAIL_SHAPE,
  combine,
  diffEngagement,
  durationLabel,
  valuesFor,
  vetGuest,
  type FormShape,
} from "@/lib/events/engagement-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SuccessModal } from "@/components/ui/success-modal";
import { Label } from "@/components/ui/label";
import { X, ChevronDown, Wand2, AlertTriangle, Mail, Check } from "lucide-react";
import { toDateKey } from "@/lib/utils/dates";
import {
  getAvailabilityAction,
  type AvailabilitySlot,
} from "@/app/actions/availability";

/* ------------------------------------------------------------------ */
/*  Schedule / Revise Engagement                                       */
/*                                                                     */
/*  One form for both, because they are the same form. Pass an `event` */
/*  and it edits that engagement; omit it and it schedules a new one.  */
/*                                                                     */
/*  The form speaks in the shapes a person types — a day, a start      */
/*  time, a duration — and assembles the instants on submit. Asking    */
/*  for an end time instead would make the common case (a 30-minute    */
/*  call) two fields of arithmetic.                                    */
/*                                                                     */
/*  Two lists of people, because they are two different kinds of       */
/*  thing. ATTENDEES are picked from the workspace directory and are   */
/*  identified by uid. GUESTS are typed as bare addresses and belong   */
/*  to nobody here — a client, a contractor, someone on the other side */
/*  of a deal. Both receive the same .ics invitation; only the second  */
/*  group needs somewhere to answer that is not behind a login.        */
/*                                                                     */
/*  An address that turns out to belong to a member is promoted to an  */
/*  attendee server-side rather than rejected here, so typing a        */
/*  colleague's email is a shortcut instead of an error.               */
/*                                                                     */
/*  Editing submits a SPARSE patch — only the fields that actually     */
/*  moved. This is not a micro-optimisation: the server decides who to */
/*  re-invite from which fields are present, so posting the whole form */
/*  every time would mail every attendee and every outside guest over  */
/*  a typo fix, and teach all of them to ignore the next one that      */
/*  matters.                                                           */
/* ------------------------------------------------------------------ */

interface EngagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  members: Member[];
  currentUserId: string;
  /** Prefills the day when opened from a calendar cell. Create only. */
  defaultDateKey?: string | null;
  /** Present means edit THIS engagement; absent means schedule a new one. */
  event?: OrbitEvent | null;
  onCreated?: () => void;
}

export function EngagementDialog({
  open,
  onOpenChange,
  projectId,
  members,
  currentUserId,
  defaultDateKey,
  event = null,
  onCreated,
}: EngagementDialogProps) {
  const isEdit = event !== null;
  /* On a new engagement the organizer is whoever is filling the form. On
     an existing one it stays the person who scheduled it, even when an
     owner is the one editing. */
  const organizerUid = event?.createdBy ?? currentUserId;
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* Guest entry. The draft lives outside the form because it is not a
     value being submitted — it is the half-typed address on its way to
     becoming one. */
  const [guestDraft, setGuestDraft] = useState("");
  const [guestError, setGuestError] = useState<string | null>(null);

  /* What actually went out. Held so the dialog can report a delivery
     problem instead of closing over it: the engagement is saved either
     way, but "three invitations bounced" is not something to discover
     later from someone who never turned up. */
  const [report, setReport] = useState<InviteOutcome | null>(null);
  const [lastOutcome, setLastOutcome] = useState<InviteOutcome | null>(null);

  /* The guest list as the server currently holds it, for diffing against.
     `guestsEditable` gates the field: until the existing addresses are in
     hand, editing them could only ever destroy them. */
  const [originalGuests, setOriginalGuests] = useState<string[]>([]);
  const [guestsEditable, setGuestsEditable] = useState(true);

  /* Availability — fetched on demand rather than on every keystroke, so
     the suggestions are a deliberate act and not a background query. */
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [busy, setBusy] = useState<AvailabilitySlot[]>([]);
  const [fullyBooked, setFullyBooked] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const attendeeFieldRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormShape>({ defaultValues: valuesFor(event, defaultDateKey) });

  const attendees = watch("attendees") || [];
  const guests = watch("guests") || [];
  const allDay = watch("allDay");
  const date = watch("date");
  const startTime = watch("startTime");
  const durationMins = Number(watch("durationMins")) || 30;

  /* An engagement that already exists need not be one of the offered
     lengths. Its real length joins the list rather than being silently
     snapped to the nearest one on the way through the form. */
  const durationOptions = useMemo(() => {
    const all = new Set<number>(DURATIONS);
    if (durationMins > 0) all.add(durationMins);
    return [...all].sort((a, b) => a - b);
  }, [durationMins]);

  /* Computed live so the warning the organizer reads is produced by the
     same rule the dispatcher will apply. */
  const watched = watch();
  const pendingEdit = event
    ? diffEngagement(event, watched, originalGuests, guestsEditable)
    : null;

  /* Does the time currently in the form collide with something already
     booked? Derived from the same fetch that produced the suggestions,
     so it costs nothing extra and updates as the fields change. */
  const conflict = (() => {
    if (allDay || busy.length === 0 || !date || !startTime) return false;
    const start = combine(date, startTime).getTime();
    const end = start + durationMins * 60_000;
    return busy.some((b) => {
      const bs = new Date(b.start).getTime();
      const be = new Date(b.end).getTime();
      return bs < end && be > start;
    });
  })();

  const findTimes = async () => {
    setSearching(true);
    setFormError(null);
    try {
      // Search from the chosen day forward, so the suggestions respect
      // where the person already navigated to.
      const from = new Date(Math.max(Date.now(), combine(date, "00:00").getTime()));
      const to = new Date(from.getTime() + 14 * 86_400_000);

      const result = await getAvailabilityAction(currentUserId, {
        attendees,
        from: from.toISOString(),
        to: to.toISOString(),
        durationMins,
        bufferMins: 10,
        minimumNoticeMins: 30,
        granularityMins: 15,
        limit: 8,
      });

      if (!result.success) {
        setFormError(result.error);
        return;
      }
      setSlots(result.data.slots);
      setBusy(result.data.busy);
      setFullyBooked(result.data.fullyBooked);
    } finally {
      setSearching(false);
    }
  };

  const applySlot = (slot: AvailabilitySlot) => {
    const start = new Date(slot.start);
    setValue("date", toDateKey(start));
    setValue(
      "startTime",
      `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`
    );
  };

  /* The engagement is reached through a ref so that opening is what
     reloads the form, not the identity of this prop. `event` comes from a
     live Firestore subscription and is a brand new object on every write
     anywhere in the org's calendar — in the dependency list it would wipe
     out whatever the person had half-typed. */
  const eventRef = useRef(event);
  eventRef.current = event;
  const eventId = event?.id ?? null;

  useEffect(() => {
    if (!open) return;

    setFormError(null);
    // Stale suggestions are worse than none — they describe a search the
    // person can no longer see the inputs for.
    setSlots(null);
    setBusy([]);
    setFullyBooked([]);
    setGuestDraft("");
    setGuestError(null);
    setReport(null);

    const current = eventRef.current;
    reset(valuesFor(current, defaultDateKey));
    setOriginalGuests([]);

    const guestIds = current?.guests ?? [];
    if (guestIds.length === 0) {
      setGuestsEditable(true);
      return;
    }

    /* Guests are ids on the engagement and live in a collection the client
       cannot read, so they have to be fetched before the field can be
       shown. Until then it stays locked — see `diffEngagement`. */
    setGuestsEditable(false);

    let active = true;
    getEngagementGuestsAction(currentUserId, current!.id).then((result) => {
      if (!active) return;

      if (!result.success) {
        setGuestError(
          "The current guests could not be loaded, so the guest list cannot be changed here. Everything else is still editable."
        );
        return;
      }

      const emails = result.data
        .map((guest) => guest.email)
        .filter((email): email is string => Boolean(email));

      setOriginalGuests(emails);
      setValue("guests", emails);
      setGuestsEditable(true);
    });

    return () => {
      active = false;
    };
  }, [open, eventId, defaultDateKey, currentUserId, reset, setValue]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* The attendee list is absolutely positioned inside the scrolling field
     area, so near the bottom of the form it opens partly out of sight.
     Bringing the field into view first means the list always has room. */
  useEffect(() => {
    if (!dropdownOpen) return;
    attendeeFieldRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [dropdownOpen]);

  /**
   * Folds a batch of addresses in as one update. Returns false when
   * anything was rejected, so the caller knows whether to clear the field
   * it came from — losing what someone typed because it had a typo in it
   * is its own bug.
   *
   * Batched rather than one-at-a-time because `guests` is a closed-over
   * render value: a per-address helper called in a loop would vet every
   * entry against the same stale list, letting a pasted duplicate through
   * and mismeasuring the limit.
   */
  const addGuests = (raws: string[]): boolean => {
    const next = [...guests];
    let error: string | null = null;

    for (const raw of raws) {
      const verdict = vetGuest(raw, next);
      if (verdict.error) {
        error = error ?? verdict.error; // the first problem is the useful one
        continue;
      }
      if (verdict.email) next.push(verdict.email);
    }

    if (next.length !== guests.length) setValue("guests", next);
    setGuestError(error);
    return error === null;
  };

  const commitDraft = () => {
    if (addGuests([guestDraft])) setGuestDraft("");
  };

  const removeGuest = (email: string) => {
    setValue("guests", guests.filter((g) => g !== email));
    setGuestError(null);
  };

  const toggleAttendee = (memberId: string) => {
    if (attendees.includes(memberId)) {
      setValue("attendees", attendees.filter((id) => id !== memberId));
    } else {
      setValue("attendees", [...attendees, memberId]);
    }
  };

  /* Closes out after a delivery report. No success modal — a green tick
     directly after "two invitations failed" reads as a system that was
     not listening. */
  const dismissReport = () => {
    reset();
    setGuestDraft("");
    setReport(null);
    onOpenChange(false);
  };

  const onSubmit = async (data: FormShape) => {
    setLoading(true);
    setFormError(null);
    try {
      /* An address still sitting in the draft field has been typed but
         not committed — pressing the submit button directly from it is
         the obvious way to get here, and dropping the guest silently
         would be the worst possible reading of that gesture. */
      const draft = guestDraft.trim().toLowerCase();
      const guestList =
        draft && EMAIL_SHAPE.test(draft) && !data.guests.includes(draft)
          ? [...data.guests, draft]
          : data.guests;

      const submitted: FormShape = { ...data, guests: guestList };

      const result = event
        ? await submitEdit(event, submitted)
        : await submitCreate(submitted);

      if (result === "unchanged") {
        onOpenChange(false);
        return;
      }

      if (!result.success) {
        setFormError(result.error);
        return;
      }

      // The engagement exists from here on. Everything below is about
      // how it went, never about whether it happened.
      onCreated?.();
      setLastOutcome(result.invites);

      /* A clean send closes the dialog. Anything the organizer has to act
         on — a bounced address, a typo the server rejected — replaces the
         form with a report instead, because a toast that vanishes after
         two seconds is not where you put "this person was not invited".
         Replacing the form rather than sitting on top of it also removes
         any way to submit the same engagement a second time. */
      const needsAttention =
        result.invites.invitesFailed > 0 || result.invites.invalidEmails.length > 0;

      if (needsAttention) {
        setReport(result.invites);
        return;
      }

      reset();
      setGuestDraft("");
      onOpenChange(false);
      setShowSuccess(true);
    } catch (err: any) {
      console.error("Failed to save engagement:", err);
      setFormError(
        err?.message ||
          (isEdit ? "Could not save the changes." : "Could not schedule the engagement.")
      );
    } finally {
      setLoading(false);
    }
  };

  async function submitCreate(data: FormShape) {
    const start = data.allDay
      ? combine(data.date, "00:00")
      : combine(data.date, data.startTime);

    const end = data.allDay
      ? new Date(start.getTime() + 86_400_000) // exclusive end, next midnight
      : new Date(start.getTime() + Number(data.durationMins) * 60_000);

    return createEventAction(currentUserId, {
      projectId,
      title: data.title,
      description: data.description,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      allDay: data.allDay,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      location: data.location || null,
      meetingUrl: data.meetingUrl || null,
      attendees: data.attendees,
      guests: data.guests.map((email) => ({ email })),
    });
  }

  /**
   * Sends only what moved. A form with nothing changed in it is not an
   * error and not a write — saving it anyway would bump the sequence and
   * put a "this meeting was updated" mail in front of people for whom
   * nothing was.
   */
  async function submitEdit(target: OrbitEvent, data: FormShape) {
    const diff = diffEngagement(target, data, originalGuests, guestsEditable);
    if (!diff.hasChanges) return "unchanged" as const;

    return updateEventAction(currentUserId, target.id, diff.patch);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* This form is taller than the viewport on a laptop, and the shared
            DialogContent centres itself with no max-height — so it would hang
            off both edges with nothing to scroll. Height is capped here and
            the field area scrolls inside it, keeping the title and the submit
            button visible at all times. Padding moves inward for that reason. */}
        <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px] bg-surface-sunken/95 border-line/[0.04]">
          <DialogHeader className="shrink-0 space-y-4 px-10 pt-10 text-left sm:text-left">
            <DialogTitle className="text-xl font-medium tracking-tight text-ink">
              {report
                ? "Saved, with a problem"
                : isEdit
                  ? "Revise Engagement"
                  : "Schedule Engagement"}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed text-ink-dim font-light max-w-[380px]">
              {report
                ? "The engagement is saved. Some invitations did not reach the people they were meant for."
                : isEdit
                  ? "Change the time, the place, or who is in it. Everyone already holding this gets an updated copy."
                  : "Reserve a block of time and put people in it. Everyone invited answers for themselves."}
            </DialogDescription>
          </DialogHeader>

          {report ? (
            /* Delivery report. The engagement is saved and correct by the
               time this renders — the only job left is making sure a failed
               invitation is something the organizer learns now, from the
               screen they are already looking at. */
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-10 py-2">
                <div className="flex items-start gap-3 rounded-xl bg-surface-raised/60 p-4 ring-1 ring-inset ring-line/[0.05]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-orbit-green" aria-hidden />
                  <p className="text-[13px] leading-relaxed text-ink-muted">
                    The engagement is on the calendar
                    {report.invitesSent > 0
                      ? ` and ${report.invitesSent} invitation${
                          report.invitesSent === 1 ? "" : "s"
                        } went out.`
                      : "."}
                    {report.promotedToMembers > 0 &&
                      ` ${report.promotedToMembers} address${
                        report.promotedToMembers === 1 ? "" : "es"
                      } already belonged to someone here, so they were added as attendees.`}
                  </p>
                </div>

                {report.invalidEmails.length > 0 && (
                  <div className="space-y-2">
                    <p className="flex items-start gap-2 text-[12px] leading-relaxed text-orbit-amber">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                      Rejected before sending — check for a typo:
                    </p>
                    <ul className="space-y-1 pl-5">
                      {report.invalidEmails.map((email) => (
                        <li key={email} className="break-all font-mono text-[11px] text-ink-muted">
                          {email}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {report.failedEmails.length > 0 && (
                  <div className="space-y-2">
                    <p className="flex items-start gap-2 text-[12px] leading-relaxed text-orbit-red">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                      Could not be delivered:
                    </p>
                    <ul className="space-y-1 pl-5">
                      {report.failedEmails.map((email) => (
                        <li key={email} className="break-all font-mono text-[11px] text-ink-muted">
                          {email}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Failures the dispatcher counted but could not name — the
                    recipient ceiling being the usual reason. Reported rather
                    than rounded away, because the gap between "9 sent" and
                    "12 invited" is the whole point. */}
                {report.invitesFailed - report.failedEmails.length > 0 && (
                  <p className="text-[12px] leading-relaxed text-orbit-red">
                    {report.invitesFailed - report.failedEmails.length} further invitation
                    {report.invitesFailed - report.failedEmails.length === 1 ? "" : "s"} did not go
                    out.
                  </p>
                )}

                <p className="text-[12px] font-light leading-relaxed text-ink-dim">
                  Nobody listed above has been invited. They will not see this
                  engagement on their calendar until you reach them another way.
                </p>
              </div>

              <DialogFooter className="mt-0 shrink-0 flex-row justify-start gap-4 border-t border-line/[0.05] bg-surface-sunken/95 px-10 py-6 sm:justify-start">
                <Button
                  type="button"
                  onClick={dismissReport}
                  className="h-9 min-w-[120px] rounded-lg px-5 text-[12px]"
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* min-h-0 above is what lets this actually scroll — without it a
                flex child refuses to shrink below its content height. */}
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-10 py-2">
            <div className="space-y-2.5">
              <Label htmlFor="event-title">Engagement Title</Label>
              <Input
                id="event-title"
                placeholder="What is this time for?"
                {...register("title", { required: "A title is required" })}
              />
              {errors.title && (
                <p className="text-[12px] text-orbit-red">{errors.title.message}</p>
              )}
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="event-description">Agenda</Label>
              <Textarea
                id="event-description"
                placeholder="What needs covering..."
                rows={2}
                {...register("description")}
              />
            </div>

            {/* Timing */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2.5">
                <Label htmlFor="event-date">Day</Label>
                <Input
                  id="event-date"
                  type="date"
                  {...register("date", { required: "Pick a day" })}
                  className="[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:transition-opacity hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
                />
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="event-start">Start</Label>
                <Input
                  id="event-start"
                  type="time"
                  disabled={allDay}
                  {...register("startTime")}
                  className="disabled:opacity-30 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-50"
                />
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="event-duration">Duration</Label>
                <select
                  id="event-duration"
                  disabled={allDay}
                  {...register("durationMins", { valueAsNumber: true })}
                  className="h-9 w-full rounded-md border border-line/[0.1] bg-surface-sunken px-3 text-[13px] text-ink transition-colors focus:border-line/[0.2] focus:outline-none disabled:opacity-30"
                >
                  {durationOptions.map((mins) => (
                    <option key={mins} value={mins}>
                      {durationLabel(mins)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 text-[12px] text-ink-muted">
              <input
                type="checkbox"
                {...register("allDay")}
                className="h-3.5 w-3.5 rounded border-line/[0.1] bg-surface-sunken accent-ink"
              />
              Runs all day
            </label>

            {/* Find a time — availability across everyone invited */}
            {!allDay && (
              <div className="rounded-xl bg-surface-raised/60 p-4 ring-1 ring-inset ring-line/[0.05]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium tracking-tight text-ink">Find a time</p>
                    <p className="mt-0.5 text-[12px] font-light text-ink-dim">
                      Open {durationMins}-minute slots for everyone invited, over the next two weeks.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={findTimes}
                    disabled={searching}
                    className="inline-flex h-8 shrink-0 items-center gap-2 rounded-lg bg-surface-control px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink ring-1 ring-inset ring-line/[0.08] transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40"
                  >
                    <Wand2 className="h-3 w-3" aria-hidden />
                    {searching ? "Searching…" : "Suggest"}
                  </button>
                </div>

                {slots !== null && (
                  <div className="mt-4">
                    {slots.length === 0 ? (
                      <p className="text-[12px] font-light leading-relaxed text-ink-muted">
                        Nothing open in working hours over the next fortnight.
                        {fullyBooked.length > 0 && (
                          <>
                            {" "}
                            <span className="text-ink">
                              {fullyBooked
                                .map((id) => members.find((m) => m.id === id)?.name || "Someone")
                                .join(", ")}
                            </span>{" "}
                            {fullyBooked.length === 1 ? "has" : "have"} no room at all — try a shorter
                            engagement or fewer people.
                          </>
                        )}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {slots.map((slot) => {
                          const start = new Date(slot.start);
                          return (
                            <button
                              key={slot.start}
                              type="button"
                              onClick={() => applySlot(slot)}
                              className="rounded-lg bg-surface-control px-2.5 py-1.5 font-mono text-[10px] tabular-nums text-ink-muted ring-1 ring-inset ring-line/[0.06] transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            >
                              {start.toLocaleDateString(undefined, {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              })}
                              {" · "}
                              {String(start.getHours()).padStart(2, "0")}:
                              {String(start.getMinutes()).padStart(2, "0")}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {conflict && (
                  <p className="mt-4 flex items-start gap-2 text-[12px] font-light leading-relaxed text-orbit-amber">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    Someone invited is already booked then. You can still schedule it.
                  </p>
                )}
              </div>
            )}

            {/* People */}
            <div ref={attendeeFieldRef} className="space-y-2.5">
              <Label>Attendees</Label>
              <div ref={dropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex min-h-[36px] w-full flex-wrap items-center gap-1.5 rounded-md border border-line/[0.1] bg-surface-sunken px-3 py-1.5 text-left transition-colors focus:border-line/[0.2] focus:outline-none"
                >
                  {attendees.length === 0 ? (
                    <span className="text-[13px] text-ink-dim">Just you</span>
                  ) : (
                    attendees.map((uid) => {
                      const member = members.find((m) => m.id === uid);
                      return (
                        <span
                          key={uid}
                          className="inline-flex items-center gap-1 rounded border border-line/[0.08] bg-surface-control px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-ink"
                        >
                          {member?.name?.split(" ")[0] || "?"}
                          <button
                            type="button"
                            aria-label={`Remove ${member?.name || "attendee"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAttendee(uid);
                            }}
                            className="ml-0.5 transition-colors hover:text-orbit-red"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })
                  )}
                  <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-ink-dim" />
                </button>

                {dropdownOpen && (
                  <div className="absolute z-50 mt-1 max-h-[180px] w-full overflow-y-auto rounded-md border border-line/[0.1] bg-surface-sunken shadow-raised">
                    {members
                      .filter((m) => m.id !== organizerUid)
                      .map((member) => {
                        const isSelected = attendees.includes(member.id);
                        return (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => toggleAttendee(member.id)}
                            className={`w-full px-3 py-2 text-left font-mono text-[12px] transition-colors ${
                              isSelected
                                ? "bg-surface-control text-ink"
                                : "text-ink-muted hover:bg-surface-raised hover:text-ink"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              {isSelected && <span className="text-[10px] text-orbit-green">●</span>}
                              {member.name}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
              <p className="font-mono text-[10px] text-ink-faint">
                {organizerUid === currentUserId
                  ? "You are always included as the organizer."
                  : `${
                      members.find((m) => m.id === organizerUid)?.name || "The organizer"
                    } is always included as the organizer.`}
              </p>
            </div>

            {/* Guests — anyone without an OrbitOS account. This is the field
                that lets an engagement leave the workspace at all: every
                address here gets a real calendar invitation it can accept
                from its own inbox, with no sign-up in the way. */}
            <div className="space-y-2.5">
              <Label htmlFor="event-guests">Guests</Label>

              {/* The wrapper carries the focus ring because the real input
                  sits inside it alongside the chips. */}
              <div
                onClick={() => document.getElementById("event-guests")?.focus()}
                className="flex min-h-[36px] w-full flex-wrap items-center gap-1.5 rounded-md border border-line/[0.1] bg-surface-sunken px-3 py-1.5 transition-colors focus-within:border-line/[0.2]"
              >
                {guests.map((email) => (
                  <span
                    key={email}
                    className="inline-flex max-w-full items-center gap-1.5 rounded border border-line/[0.08] bg-surface-control px-2 py-0.5 font-mono text-[11px] text-ink"
                  >
                    <Mail className="h-2.5 w-2.5 shrink-0 opacity-40" aria-hidden />
                    <span className="truncate">{email}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${email}`}
                      disabled={!guestsEditable}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeGuest(email);
                      }}
                      className="shrink-0 transition-colors hover:text-orbit-red disabled:opacity-40"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}

                <input
                  id="event-guests"
                  type="text"
                  inputMode="email"
                  autoComplete="off"
                  value={guestDraft}
                  disabled={!guestsEditable}
                  placeholder={
                    !guestsEditable
                      ? "Loading the current guests…"
                      : guests.length === 0
                        ? "name@company.com"
                        : "Add another…"
                  }
                  onChange={(e) => {
                    setGuestDraft(e.target.value);
                    if (guestError) setGuestError(null);
                  }}
                  onKeyDown={(e) => {
                    /* Enter here means "add this address". Without the
                       preventDefault it submits the whole form, scheduling
                       the engagement the moment someone finishes typing a
                       guest — which is the single worst thing this field
                       could do. */
                    if (e.key === "Enter" || e.key === "," || e.key === ";") {
                      e.preventDefault();
                      commitDraft();
                    } else if (e.key === "Backspace" && guestDraft === "" && guests.length > 0) {
                      removeGuest(guests[guests.length - 1]);
                    }
                  }}
                  /* Moving on is a commit. Nobody expects to lose an address
                     because they clicked the next field instead of pressing
                     Enter. */
                  onBlur={commitDraft}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text");
                    // A lone address types itself in fine; only a list needs
                    // splitting, which is how a To: field or a spreadsheet
                    // column arrives.
                    if (!/[\s,;]/.test(text.trim())) return;
                    e.preventDefault();
                    if (addGuests(text.split(/[\s,;]+/))) setGuestDraft("");
                  }}
                  className="min-w-[140px] flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-dim focus:outline-none disabled:cursor-not-allowed"
                />
              </div>

              {guestError ? (
                <p className="text-[12px] text-orbit-red">{guestError}</p>
              ) : (
                <p className="font-mono text-[10px] leading-relaxed text-ink-faint">
                  Enter or comma to add. They get an invitation they can accept
                  from their inbox — no account needed. An address that already
                  belongs to someone here joins as an attendee instead.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2.5">
                <Label htmlFor="event-location">Location</Label>
                <Input id="event-location" placeholder="Studio, room, city…" {...register("location")} />
              </div>
              <div className="space-y-2.5">
                <Label htmlFor="event-link">Meeting Link</Label>
                <Input id="event-link" placeholder="https://…" {...register("meetingUrl")} />
              </div>
            </div>

            {/* Editing mails other people, including people outside the
                company, so what saving will do is stated before it is done
                rather than discovered afterwards from the replies. */}
            {pendingEdit && (
              <div className="rounded-xl bg-surface-raised/60 p-4 ring-1 ring-inset ring-line/[0.05]">
                <p className="text-[13px] font-medium tracking-tight text-ink">
                  What saving sends
                </p>
                <p className="mt-1 text-[12px] font-light leading-relaxed text-ink-dim">
                  {!pendingEdit.hasChanges
                    ? "Nothing has changed yet, so nothing would go out."
                    : pendingEdit.materially
                      ? "The time, title, or place moved. Everyone on this engagement gets an updated invitation that replaces the copy sitting in their calendar."
                      : pendingEdit.added > 0
                        ? "Only the people just added get an invitation. Nobody else is contacted."
                        : "No invitations — this changes nothing that anyone is holding a copy of."}
                  {pendingEdit.removed > 0 &&
                    ` ${pendingEdit.removed} ${
                      pendingEdit.removed === 1 ? "person is" : "people are"
                    } being taken off and will get a cancellation, which clears it from their calendar.`}
                </p>
              </div>
            )}

            {formError && (
              <p className="rounded-md border border-orbit-red/20 bg-orbit-red/[0.06] px-3 py-2 text-[12px] text-orbit-red">
                {formError}
              </p>
            )}
            </div>

            {/* Pinned below the scroll area — the submit action should never
                be something you have to scroll to find. */}
            <DialogFooter className="mt-0 shrink-0 flex-row justify-start gap-4 border-t border-line/[0.05] bg-surface-sunken/95 px-10 py-6 sm:justify-start">
              <Button type="submit" disabled={loading} className="h-9 min-w-[120px] rounded-lg px-5 text-[12px]">
                {loading
                  ? isEdit
                    ? "Saving..."
                    : "Reserving..."
                  : isEdit
                    ? "Save Changes"
                    : "Reserve Time"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="h-9 rounded-lg px-5 text-[12px] text-ink-faint hover:bg-transparent hover:text-ink-muted"
              >
                Cancel
              </Button>
            </DialogFooter>
          </form>
          )}
        </DialogContent>
      </Dialog>

      <SuccessModal
        open={showSuccess}
        onOpenChange={setShowSuccess}
        title="Time Reserved"
        description={
          lastOutcome && lastOutcome.invitesSent > 0
            ? `Invitations sent to ${lastOutcome.invitesSent} ${
                lastOutcome.invitesSent === 1 ? "person" : "people"
              }. It will appear on their calendar once they accept.`
            : "The engagement is on the calendar and attendees can now respond."
        }
      />
    </>
  );
}
