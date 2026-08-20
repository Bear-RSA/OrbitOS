import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Engagement Validation                                              */
/*                                                                     */
/*  The span rules live here rather than in the action so the create   */
/*  dialog can surface them inline instead of round-tripping to the    */
/*  server to learn that the end is before the start.                  */
/* ------------------------------------------------------------------ */

/** Nothing useful is scheduled a year out, and it bounds range queries. */
const MAX_SPAN_DAYS = 365;

const isoInstant = z
  .string()
  .min(1, "Required")
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Not a valid date/time");

/** An empty string clears the field; anything present must be a real URL. */
const optionalUrl = z
  .string()
  .trim()
  .max(2048, "Link too long")
  .refine((v) => {
    if (v.length === 0) return true;
    try {
      const url = new URL(v);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Must be a http(s) link")
  .nullable()
  .optional();

const attendees = z
  .array(z.string().min(1))
  .max(50, "Maximum 50 attendees per engagement");

/**
 * Off-platform invitees. The shape check is deliberately loose — the
 * server resolves each address against the member directory before
 * deciding it is external, and Resend validates properly on send. This
 * only stops something that is obviously not an address.
 */
const guests = z
  .array(
    z.object({
      email: z
        .string()
        .trim()
        .min(3, "Enter an email address")
        .max(254, "Email too long")
        .email("Not a valid email address"),
      name: z.string().trim().max(80, "Name too long").optional(),
    })
  )
  .max(25, "Maximum 25 guests per engagement");

/**
 * Shared span check. Applied via `superRefine` on each schema so both keep
 * their own inferred input/output types — a generic wrapper would collapse
 * the two and make fields with defaults look required to callers.
 */
function checkSpan(
  value: { startAt?: string; endAt?: string },
  ctx: z.RefinementCtx
) {
  const { startAt, endAt } = value;
  if (!startAt || !endAt) return;

  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return; // field-level rules report this

  if (end <= start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endAt"],
      message: "The end must come after the start",
    });
    return;
  }

  if ((end - start) / 86_400_000 > MAX_SPAN_DAYS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endAt"],
      message: `An engagement cannot run longer than ${MAX_SPAN_DAYS} days`,
    });
  }
}

export const createEventSchema = z
  .object({
    projectId: z.string().nullable().default(null),
    title: z.string().trim().min(1, "A title is required").max(140, "Title too long"),
    description: z.string().max(1000, "Description too long").optional().default(""),
    startAt: isoInstant,
    endAt: isoInstant,
    allDay: z.boolean().optional().default(false),
    timeZone: z.string().max(64).optional(),
    location: z.string().trim().max(200, "Location too long").nullable().optional(),
    meetingUrl: optionalUrl,
    attendees: attendees.optional().default([]),
    guests: guests.optional().default([]),
  })
  .superRefine(checkSpan);

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(1, "A title is required").max(140, "Title too long").optional(),
    description: z.string().max(1000, "Description too long").optional(),
    startAt: isoInstant.optional(),
    endAt: isoInstant.optional(),
    allDay: z.boolean().optional(),
    timeZone: z.string().max(64).optional(),
    location: z.string().trim().max(200, "Location too long").nullable().optional(),
    meetingUrl: optionalUrl,
    attendees: attendees.optional(),
    guests: guests.optional(),
  })
  .superRefine(checkSpan);

export const rsvpSchema = z.object({
  eventId: z.string().min(1),
  status: z.enum(["pending", "accepted", "declined", "tentative"]),
});

export type CreateEventSchema = z.infer<typeof createEventSchema>;
export type UpdateEventSchema = z.infer<typeof updateEventSchema>;
