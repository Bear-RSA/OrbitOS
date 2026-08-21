import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore, type Row } from "@/lib/testing/fake-firestore";

/* ------------------------------------------------------------------ */
/*  Due-today digest                                                   */
/*                                                                     */
/*  The selection, grouping and ceilings are `due-mailer`'s and are    */
/*  covered in depth by the reminder suite, which exercises the same   */
/*  code. What is untested by that suite, and what actually risks      */
/*  double-mailing somebody, is what this run does DIFFERENTLY: which  */
/*  day it targets and which marker it reads and writes.               */
/*                                                                     */
/*  The pairing matters. A task due tomorrow is mailed about twice —   */
/*  tonight as "due tomorrow", in the morning as "due today" — and a   */
/*  shared marker would let whichever ran first silence the other.     */
/* ------------------------------------------------------------------ */

const db = new FakeFirestore();
vi.mock("@/lib/firebase/admin", () => ({ adminDb: db }));

type SendResult = { success: true } | { success: false; error: string };

interface MailCall {
  recipient: { name: string; email: string };
  tasks: { id: string; title: string }[];
  dueDateKey: string;
}

const sendDueTodayDigest = vi.fn<(p: MailCall) => Promise<SendResult>>(async () => ({
  success: true,
}));
vi.mock("@/lib/email/sendDueTodayDigest", () => ({ sendDueTodayDigest }));

const sendTaskReminder = vi.fn<(p: MailCall) => Promise<SendResult>>(async () => ({
  success: true,
}));
vi.mock("@/lib/email/sendTaskReminder", () => ({ sendTaskReminder }));

vi.mock("@/lib/auth/permissions", () => ({
  resolveTaskReminderLimit: vi.fn(async () => -1),
}));

const { runDueTodayDigest } = await import("@/lib/tasks/due-today");
const { runDueTaskReminders } = await import("@/lib/tasks/due-reminders");

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

/** 06:00 SAST on the 21st is 04:00 UTC — the moment the cron fires. */
const NOW = new Date("2026-08-21T04:00:00Z");
const TODAY = "2026-08-21";

/** Due dates are stored as midday UTC of their calendar day. */
function dueAt(key: string): Timestamp {
  return Timestamp.fromDate(new Date(`${key}T12:00:00Z`));
}

function seedTask(id: string, overrides: Row = {}) {
  db.seed("tasks", id, {
    title: `Task ${id}`,
    orgId: "org-1",
    projectId: "proj-1",
    status: "todo",
    assignedTo: ["u1"],
    isBlocked: false,
    dueDateKey: TODAY,
    dueDate: dueAt(TODAY),
    ...overrides,
  });
}

beforeEach(() => {
  db.reset();
  sendDueTodayDigest.mockClear();
  sendDueTodayDigest.mockImplementation(async () => ({ success: true }));
  sendTaskReminder.mockClear();
  db.seed("organizations", "org-1", { name: "Mirai Stack" });
  db.seed("users", "u1", {
    name: "Ada",
    email: "u1@example.com",
    orgId: "org-1",
  });
});

/* ------------------------------------------------------------------ */
/*  Selection                                                          */
/* ------------------------------------------------------------------ */

describe("runDueTodayDigest — selection", () => {
  it("targets the day of the run, not the day after", async () => {
    seedTask("t1");

    const result = await runDueTodayDigest({ now: NOW });

    expect(result.targetDateKey).toBe(TODAY);
    expect(sendDueTodayDigest).toHaveBeenCalledTimes(1);
    expect(sendDueTodayDigest.mock.calls[0][0].dueDateKey).toBe(TODAY);
  });

  it("ignores work due tomorrow", async () => {
    seedTask("t1", { dueDateKey: "2026-08-22", dueDate: dueAt("2026-08-22") });

    const result = await runDueTodayDigest({ now: NOW });

    expect(result.candidates).toBe(0);
    expect(sendDueTodayDigest).not.toHaveBeenCalled();
  });

  it("ignores work already finished", async () => {
    seedTask("t1", { status: "done" });

    await runDueTodayDigest({ now: NOW });

    expect(sendDueTodayDigest).not.toHaveBeenCalled();
  });

  it("reads the day in Johannesburg, not UTC", async () => {
    // 01:00 SAST on the 21st is still the 20th in UTC. The digest is about
    // the recipient's day, so this must select the 21st.
    seedTask("t1");

    const result = await runDueTodayDigest({
      now: new Date("2026-08-20T23:00:00Z"),
    });

    expect(result.targetDateKey).toBe(TODAY);
  });
});

/* ------------------------------------------------------------------ */
/*  Idempotency                                                        */
/* ------------------------------------------------------------------ */

describe("runDueTodayDigest — idempotency", () => {
  it("marks its own field, leaving the reminder's alone", async () => {
    seedTask("t1");

    await runDueTodayDigest({ now: NOW });

    const task = db.read("tasks", "t1")!;
    expect(task.dueTodaySentFor).toBe(TODAY);
    expect(task.dueReminderSentFor).toBeUndefined();
  });

  it("does not digest twice about the same day", async () => {
    seedTask("t1", { dueTodaySentFor: TODAY });

    const result = await runDueTodayDigest({ now: NOW });

    expect(result.candidates).toBe(0);
    expect(sendDueTodayDigest).not.toHaveBeenCalled();
  });

  it("still digests work the evening reminder already covered", async () => {
    // Yesterday's 09:00 reminder marked this as "due tomorrow". This
    // morning's digest is a different mail about the same task and must
    // not be silenced by that marker.
    seedTask("t1", { dueReminderSentFor: TODAY });

    await runDueTodayDigest({ now: NOW });

    expect(sendDueTodayDigest).toHaveBeenCalledTimes(1);
  });

  it("still reminds about work this morning's digest already covered", async () => {
    seedTask("t1", {
      dueTodaySentFor: "2026-08-22",
      dueDateKey: "2026-08-22",
      dueDate: dueAt("2026-08-22"),
    });

    // 09:00 SAST on the 21st, reminding about the 22nd.
    await runDueTaskReminders({ now: new Date("2026-08-21T07:00:00Z") });

    expect(sendTaskReminder).toHaveBeenCalledTimes(1);
  });

  it("honours its own preference, not the reminder's", async () => {
    db.seed("users", "u1", {
      name: "Ada",
      email: "u1@example.com",
      orgId: "org-1",
      preferences: { dueTodayDigest: false, taskReminders: true },
    });
    seedTask("t1");

    const result = await runDueTodayDigest({ now: NOW });

    expect(sendDueTodayDigest).not.toHaveBeenCalled();
    expect(result.skipped).toContain("u1@example.com (due-today digest disabled)");
  });

  it("writes nothing and sends nothing on a dry run", async () => {
    seedTask("t1");

    const result = await runDueTodayDigest({ now: NOW, dryRun: true });

    expect(sendDueTodayDigest).not.toHaveBeenCalled();
    expect(db.read("tasks", "t1")!.dueTodaySentFor).toBeUndefined();
    expect(result.candidates).toBe(1);
  });
});
