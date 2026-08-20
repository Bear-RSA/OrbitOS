"use client";

import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { createEventAction } from "@/app/actions/events";
import { Member } from "@/types/member";
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
import { X, ChevronDown, Wand2, AlertTriangle } from "lucide-react";
import { toDateKey } from "@/lib/utils/dates";
import {
  getAvailabilityAction,
  type AvailabilitySlot,
} from "@/app/actions/availability";

/* ------------------------------------------------------------------ */
/*  Schedule Engagement                                                */
/*                                                                     */
/*  The form speaks in the shapes a person types — a day, a start      */
/*  time, a duration — and assembles the instants on submit. Asking    */
/*  for an end time instead would make the common case (a 30-minute    */
/*  call) two fields of arithmetic.                                    */
/* ------------------------------------------------------------------ */

const DURATIONS = [15, 30, 45, 60, 90, 120] as const;

interface FormShape {
  title: string;
  description: string;
  date: string;
  startTime: string;
  durationMins: number;
  allDay: boolean;
  location: string;
  meetingUrl: string;
  attendees: string[];
}

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  members: Member[];
  currentUserId: string;
  /** Prefills the day when opened from a calendar cell. */
  defaultDateKey?: string | null;
  onCreated?: () => void;
}

/** Combines a "YYYY-MM-DD" and "HH:mm" into a local instant. */
function combine(dateKey: string, time: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

export function CreateEventDialog({
  open,
  onOpenChange,
  projectId,
  members,
  currentUserId,
  defaultDateKey,
  onCreated,
}: CreateEventDialogProps) {
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
  } = useForm<FormShape>({
    defaultValues: {
      title: "",
      description: "",
      date: defaultDateKey || toDateKey(new Date()),
      startTime: "09:00",
      durationMins: 30,
      allDay: false,
      location: "",
      meetingUrl: "",
      attendees: [],
    },
  });

  const attendees = watch("attendees") || [];
  const allDay = watch("allDay");
  const date = watch("date");
  const startTime = watch("startTime");
  const durationMins = Number(watch("durationMins")) || 30;

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

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    // Stale suggestions are worse than none — they describe a search the
    // person can no longer see the inputs for.
    setSlots(null);
    setBusy([]);
    setFullyBooked([]);
    setValue("date", defaultDateKey || toDateKey(new Date()));
  }, [open, defaultDateKey, setValue]);

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

  const toggleAttendee = (memberId: string) => {
    if (attendees.includes(memberId)) {
      setValue("attendees", attendees.filter((id) => id !== memberId));
    } else {
      setValue("attendees", [...attendees, memberId]);
    }
  };

  const onSubmit = async (data: FormShape) => {
    setLoading(true);
    setFormError(null);
    try {
      const start = data.allDay
        ? combine(data.date, "00:00")
        : combine(data.date, data.startTime);

      const end = data.allDay
        ? new Date(start.getTime() + 86_400_000) // exclusive end, next midnight
        : new Date(start.getTime() + Number(data.durationMins) * 60_000);

      const result = await createEventAction(currentUserId, {
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
      });

      if (!result.success) {
        setFormError(result.error);
        return;
      }

      reset();
      onOpenChange(false);
      onCreated?.();
      setShowSuccess(true);
    } catch (err: any) {
      console.error("Failed to schedule engagement:", err);
      setFormError(err?.message || "Could not schedule the engagement.");
    } finally {
      setLoading(false);
    }
  };

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
              Schedule Engagement
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed text-ink-dim font-light max-w-[380px]">
              Reserve a block of time and put people in it. Everyone invited answers for themselves.
            </DialogDescription>
          </DialogHeader>

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
                  {DURATIONS.map((mins) => (
                    <option key={mins} value={mins}>
                      {mins < 60 ? `${mins} min` : `${mins / 60} hr${mins > 60 ? "s" : ""}`}
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
                      .filter((m) => m.id !== currentUserId)
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
                You are always included as the organizer.
              </p>
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
                {loading ? "Reserving..." : "Reserve Time"}
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
        </DialogContent>
      </Dialog>

      <SuccessModal
        open={showSuccess}
        onOpenChange={setShowSuccess}
        title="Time Reserved"
        description="The engagement is on the calendar and attendees can now respond."
      />
    </>
  );
}
