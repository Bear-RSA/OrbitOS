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
import { X, ChevronDown } from "lucide-react";
import { toDateKey } from "@/lib/utils/dates";

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

  useEffect(() => {
    if (!open) return;
    setFormError(null);
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
        <DialogContent className="sm:max-w-[520px] p-10 bg-[#080808]/95 border-white/[0.04]">
          <DialogHeader className="text-left sm:text-left space-y-4">
            <DialogTitle className="text-xl font-medium tracking-tight text-[#ededed]">
              Schedule Engagement
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed text-[#666666] font-light max-w-[380px]">
              Reserve a block of time and put people in it. Everyone invited answers for themselves.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-2">
            <div className="space-y-2.5">
              <Label htmlFor="event-title">Engagement Title</Label>
              <Input
                id="event-title"
                placeholder="What is this time for?"
                {...register("title", { required: "A title is required" })}
              />
              {errors.title && (
                <p className="text-[12px] text-[#E57A7A]">{errors.title.message}</p>
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
                  className="h-9 w-full rounded-md border border-[#1a1a1a] bg-[#0A0A0A] px-3 text-[13px] text-[#ededed] transition-colors focus:border-[#333] focus:outline-none disabled:opacity-30"
                >
                  {DURATIONS.map((mins) => (
                    <option key={mins} value={mins}>
                      {mins < 60 ? `${mins} min` : `${mins / 60} hr${mins > 60 ? "s" : ""}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 text-[12px] text-[#888888]">
              <input
                type="checkbox"
                {...register("allDay")}
                className="h-3.5 w-3.5 rounded border-[#1a1a1a] bg-[#0A0A0A] accent-[#ededed]"
              />
              Runs all day
            </label>

            {/* People */}
            <div className="space-y-2.5">
              <Label>Attendees</Label>
              <div ref={dropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex min-h-[36px] w-full flex-wrap items-center gap-1.5 rounded-md border border-[#1a1a1a] bg-[#0A0A0A] px-3 py-1.5 text-left transition-colors focus:border-[#333] focus:outline-none"
                >
                  {attendees.length === 0 ? (
                    <span className="text-[13px] text-[#555]">Just you</span>
                  ) : (
                    attendees.map((uid) => {
                      const member = members.find((m) => m.id === uid);
                      return (
                        <span
                          key={uid}
                          className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-[#ededed]"
                        >
                          {member?.name?.split(" ")[0] || "?"}
                          <button
                            type="button"
                            aria-label={`Remove ${member?.name || "attendee"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAttendee(uid);
                            }}
                            className="ml-0.5 transition-colors hover:text-[#E57A7A]"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })
                  )}
                  <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-[#555]" />
                </button>

                {dropdownOpen && (
                  <div className="absolute z-50 mt-1 max-h-[180px] w-full overflow-y-auto rounded-md border border-[#1a1a1a] bg-[#0A0A0A] shadow-[0_8px_32px_rgba(0,0,0,0.8)]">
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
                                ? "bg-white/[0.06] text-[#ededed]"
                                : "text-[#888] hover:bg-white/[0.04] hover:text-[#ededed]"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              {isSelected && <span className="text-[10px] text-[#85C89B]">●</span>}
                              {member.name}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
              <p className="font-mono text-[10px] text-[#444]">
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
              <p className="rounded-md border border-[#E57A7A]/20 bg-[#E57A7A]/[0.06] px-3 py-2 text-[12px] text-[#E57A7A]">
                {formError}
              </p>
            )}

            <DialogFooter className="mt-10 flex-row justify-start gap-4 sm:justify-start">
              <Button type="submit" disabled={loading} className="h-9 min-w-[120px] rounded-lg px-5 text-[12px]">
                {loading ? "Reserving..." : "Reserve Time"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="h-9 rounded-lg px-5 text-[12px] text-[#444444] hover:bg-transparent hover:text-[#888888]"
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
