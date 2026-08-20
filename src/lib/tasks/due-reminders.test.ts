import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore, type Row } from "@/lib/testing/fake-firestore";

/* ------------------------------------------------------------------ */
/*  Due-soon reminders                                                 */
/*                                                                     */
/*  This is the one module in the scheduling work that spends money on */
/*  every run, so the questions worth answering here are all about     */
/*  restraint: who is EXCLUDED, what stops a second send, and what     */
/*  happens to the idempotency marker when delivery fails.             */
/*                                                                     */
/*  Firestore is faked rather than emulated. The module touches a      */
/*  small, stable slice of the Admin SDK — chained `where`, `getAll`,  */
/*  and a batch of updates — and standing that up in-memory keeps the  */
/*  suite runnable with no emulator and no credentials.                */
/* ------------------------------------------------------------------ */

const db = new FakeFirestore();
vi.mock("@/lib/firebase/admin", () => ({ adminDb: db }));

/** The slice of the send payload these tests assert on. */
interface ReminderCall {
  recipient: { name: string; email: string };
  orgName: string;
  tasks: { id: string; title: string; unassigned: boolean }[];
  additionalCount: number;
  dueDateKey: string;
  dashboardUrl: string;
}

type SendResult = { success: true } | { success: false; error: string };

const sendTaskReminder = vi.fn<(params: ReminderCall) => Promise<SendResult>>(
  async () => ({ success: true })
);
vi.mock("@/lib/email/sendTaskReminder", () => ({ sendTaskReminder }));

const resolveTaskReminderLimit = vi.fn(async () => -1);
vi.mock("@/lib/auth/permissions", () => ({ resolveTaskReminderLimit }));

const { runDueTaskReminders } = await import("@/lib/tasks/due-reminders");

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

/** The run happens on the 20th, so everything targets the 21st. */
const NOW = new Date("2026-08-20T12:00:00Z");
const TARGET = "2026-08-21";

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
    dueDateKey: TARGET,
    dueDate: dueAt(TARGET),
    ...overrides,
  });
}

function seedUser(id: string, overrides: Row = {}) {
  db.seed("users", id, {
    name: `User ${id}`,
    email: `${id}@example.com`,
    orgId: "org-1",
    role: "MEMBER",
    ...overrides,
  });
}

beforeEach(() => {
  db.reset();
  sendTaskReminder.mockClear();
  sendTaskReminder.mockImplementation(async () => ({ success: true }));
  resolveTaskReminderLimit.mockClear();
  resolveTaskReminderLimit.mockImplementation(async () => -1);

  db.seed("organizations", "org-1", { name: "Orbit Studio" });
  db.seed("projects", "proj-1", { name: "Apollo" });
});

/** Every recipient address the run mailed, in send order. */
function recipients(): string[] {
  return sendTaskReminder.mock.calls.map((call) => call[0].recipient.email);
}

function lastPayload(): ReminderCall {
  return sendTaskReminder.mock.calls.at(-1)![0];
}

/* ------------------------------------------------------------------ */

describe("runDueTaskReminders — selection", () => {
  it("targets the day after the run", async () => {
    seedUser("u1");
    seedTask("t1");

    const result = await runDueTaskReminders({ now: NOW });

    expect(result.targetDateKey).toBe(TARGET);
    expect(result.candidates).toBe(1);
    expect(result.emailsSent).toBe(1);
    expect(lastPayload().dueDateKey).toBe(TARGET);
  });

  it("ignores work due any other day", async () => {
    seedUser("u1");
    seedTask("today", { dueDateKey: "2026-08-20", dueDate: dueAt("2026-08-20") });
    seedTask("later", { dueDateKey: "2026-08-25", dueDate: dueAt("2026-08-25") });

    const result = await runDueTaskReminders({ now: NOW });

    expect(result.candidates).toBe(0);
    expect(sendTaskReminder).not.toHaveBeenCalled();
  });

  it("ignores work already finished", async () => {
    seedUser("u1");
    seedTask("t1", { status: "done" });

    const result = await runDueTaskReminders({ now: NOW });

    expect(result.candidates).toBe(0);
    expect(sendTaskReminder).not.toHaveBeenCalled();
  });

  it("does not remind twice about the same day", async () => {
    seedUser("u1");
    seedTask("t1", { dueReminderSentFor: TARGET });

    const result = await runDueTaskReminders({ now: NOW });

    expect(result.candidates).toBe(0);
    expect(sendTaskReminder).not.toHaveBeenCalled();
  });

  it("reminds again once a task is moved to a different day", async () => {
    seedUser("u1");
    // Reminded about the 19th, since rescheduled onto the target day.
    seedTask("t1", { dueReminderSentFor: "2026-08-19" });

    const result = await runDueTaskReminders({ now: NOW });

    expect(result.candidates).toBe(1);
    expect(result.emailsSent).toBe(1);
  });

  it("trusts the date key over a drifted timestamp", async () => {
    seedUser("u1");
    // The range query catches this, but the key says another day — and the
    // key is the authority, so it must not be reminded about.
    seedTask("drifted", { dueDateKey: "2026-09-01", dueDate: dueAt(TARGET) });

    const result = await runDueTaskReminders({ now: NOW });

    expect(result.candidates).toBe(0);
  });

  it("catches legacy tasks stored at UTC midnight with no key", async () => {
    seedUser("u1");
    seedTask("legacy", {
      dueDateKey: undefined,
      dueDate: Timestamp.fromDate(new Date(`${TARGET}T00:00:00Z`)),
    });

    const result = await runDueTaskReminders({ now: NOW });

    expect(result.candidates).toBe(1);
    expect(result.emailsSent).toBe(1);
  });
});

describe("runDueTaskReminders — recipients", () => {
  it("sends one email per person, not one per task", async () => {
    seedUser("u1");
    seedTask("t1");
    seedTask("t2");
    seedTask("t3");

    const result = await runDueTaskReminders({ now: NOW });

    expect(result.candidates).toBe(3);
    expect(result.emailsSent).toBe(1);
    expect(lastPayload().tasks).toHaveLength(3);
  });

  it("reaches every assignee on a shared task", async () => {
    seedUser("u1");
    seedUser("u2");
    seedTask("t1", { assignedTo: ["u1", "u2"] });

    await runDueTaskReminders({ now: NOW });

    expect(recipients().sort()).toEqual(["u1@example.com", "u2@example.com"]);
  });

  it("sends unassigned work to the workspace owner", async () => {
    seedUser("owner", { role: "OWNER", createdAt: Timestamp.fromMillis(1000) });
    seedTask("orphan", { assignedTo: [] });

    await runDueTaskReminders({ now: NOW });

    expect(recipients()).toEqual(["owner@example.com"]);
    expect(lastPayload().tasks[0].unassigned).toBe(true);
  });

  it("picks the earliest-created owner so the recipient never rotates", async () => {
    seedUser("late", { role: "OWNER", createdAt: Timestamp.fromMillis(9000) });
    seedUser("first", { role: "OWNER", createdAt: Timestamp.fromMillis(1000) });
    seedTask("orphan", { assignedTo: [] });

    await runDueTaskReminders({ now: NOW });

    expect(recipients()).toEqual(["first@example.com"]);
  });

  it("reports an org with unclaimed work and nobody to escalate to", async () => {
    seedTask("orphan", { assignedTo: [] });

    const result = await runDueTaskReminders({ now: NOW });

    expect(result.emailsSent).toBe(0);
    expect(result.skipped).toContainEqual(
      expect.stringContaining("no owner to notify")
    );
  });

  it("honours the notification preference", async () => {
    seedUser("u1", { preferences: { taskReminders: false } });
    seedTask("t1");

    const result = await runDueTaskReminders({ now: NOW });

    expect(result.emailsSent).toBe(0);
    expect(result.skipped).toContainEqual(
      expect.stringContaining("reminders disabled")
    );
  });

  it("reminds by default when preferences were never set", async () => {
    seedUser("u1", { preferences: undefined });
    seedTask("t1");

    const result = await runDueTaskReminders({ now: NOW });
    expect(result.emailsSent).toBe(1);
  });

  it("skips an assignee with no user record", async () => {
    seedTask("t1", { assignedTo: ["ghost"] });

    const result = await runDueTaskReminders({ now: NOW });

    expect(result.emailsSent).toBe(0);
    expect(result.skipped).toContainEqual(
      expect.stringContaining("no user record or no email")
    );
  });

  it("does not mail work from an org the person has since left", async () => {
    seedUser("u1", { orgId: "org-2" });
    seedTask("t1", { orgId: "org-1" });

    const result = await runDueTaskReminders({ now: NOW });

    expect(result.emailsSent).toBe(0);
    expect(result.skipped).toContainEqual(
      expect.stringContaining("assigned outside their org")
    );
  });

  it("spans every workspace in one run, naming each correctly", async () => {
    // The cron is global — it queries `tasks` with no org filter, so one
    // run has to serve every workspace and label each email with its own.
    db.seed("organizations", "org-2", { name: "Second Studio" });
    seedUser("u1", { orgId: "org-1" });
    seedUser("u2", { orgId: "org-2" });
    seedTask("t1", { orgId: "org-1", assignedTo: ["u1"] });
    seedTask("t2", { orgId: "org-2", assignedTo: ["u2"], projectId: null });

    const result = await runDueTaskReminders({ now: NOW });

    expect(result.emailsSent).toBe(2);
    expect(recipients().sort()).toEqual(["u1@example.com", "u2@example.com"]);

    const orgNames = sendTaskReminder.mock.calls
      .map((call) => call[0].orgName)
      .sort();
    expect(orgNames).toEqual(["Orbit Studio", "Second Studio"]);
  });

  it("puts unassigned work first, then orders alphabetically", async () => {
    seedUser("owner", { role: "OWNER", createdAt: Timestamp.fromMillis(1) });
    seedTask("b", { title: "Beta", assignedTo: ["owner"] });
    seedTask("a", { title: "Alpha", assignedTo: ["owner"] });
    seedTask("z", { title: "Zulu", assignedTo: [] });

    await runDueTaskReminders({ now: NOW });

    expect(lastPayload().tasks.map((t) => t.title)).toEqual([
      "Zulu",
      "Alpha",
      "Beta",
    ]);
  });

  it("trims a very long list and reports the remainder", async () => {
    seedUser("u1");
    for (let i = 0; i < 30; i += 1) {
      seedTask(`t${String(i).padStart(2, "0")}`, { title: `Task ${i}` });
    }

    await runDueTaskReminders({ now: NOW });

    const payload = lastPayload();
    expect(payload.tasks).toHaveLength(25);
    expect(payload.additionalCount).toBe(5);
  });
});

describe("runDueTaskReminders — ceilings", () => {
  it("truncates an org to its tier limit, deterministically", async () => {
    resolveTaskReminderLimit.mockImplementation(async () => 2);
    for (const id of ["c", "a", "d", "b"]) {
      seedUser(id);
      seedTask(`task-${id}`, { assignedTo: [id] });
    }

    const result = await runDueTaskReminders({ now: NOW });

    // Sorted by address before slicing, so a capped org reaches the same
    // people every night instead of a rotating subset.
    expect(recipients()).toEqual(["a@example.com", "b@example.com"]);
    expect(result.skipped).toContainEqual(
      expect.stringContaining("over the 2/day reminder ceiling")
    );
  });

  it("never lets a tier widen past the hard ceiling", async () => {
    // -1 means "the tier does not narrow it", not "unlimited".
    resolveTaskReminderLimit.mockImplementation(async () => -1);
    seedUser("u1");
    seedTask("t1");

    const result = await runDueTaskReminders({ now: NOW });
    expect(result.emailsSent).toBe(1);
    expect(resolveTaskReminderLimit).toHaveBeenCalledWith("org-1");
  });
});

describe("runDueTaskReminders — delivery and idempotency", () => {
  it("marks a task only after its reminder actually went out", async () => {
    seedUser("u1");
    seedTask("t1");

    await runDueTaskReminders({ now: NOW });

    expect(db.read("tasks", "t1")!.dueReminderSentFor).toBe(TARGET);
  });

  it("leaves the marker unset when the send failed", async () => {
    sendTaskReminder.mockImplementation(async () => ({
      success: false,
      error: "Resend rejected the address",
    }));
    seedUser("u1");
    seedTask("t1");

    const result = await runDueTaskReminders({ now: NOW });

    expect(result.emailsFailed).toBe(1);
    // Unmarked, so tomorrow's run can try again rather than silently
    // swallowing the reminder.
    expect(db.read("tasks", "t1")!.dueReminderSentFor).toBeUndefined();
    expect(result.skipped).toContainEqual(
      expect.stringContaining("Resend rejected the address")
    );
  });

  it("does not silence a task for everyone when one recipient fails", async () => {
    sendTaskReminder.mockImplementation(async (params) =>
      params.recipient.email === "u2@example.com"
        ? { success: false, error: "bounced" }
        : { success: true }
    );
    seedUser("u1");
    seedUser("u2");
    seedTask("shared", { assignedTo: ["u1", "u2"] });

    const result = await runDueTaskReminders({ now: NOW });

    expect(result.emailsSent).toBe(1);
    expect(result.emailsFailed).toBe(1);
    // u2 never got it, so the task stays unmarked and is retried.
    expect(db.read("tasks", "shared")!.dueReminderSentFor).toBeUndefined();
  });

  it("touches only the reminder field, never updatedAt", async () => {
    seedUser("u1");
    seedTask("t1", { updatedAt: "untouched", lastUpdatedAt: "untouched" });

    await runDueTaskReminders({ now: NOW });

    const task = db.read("tasks", "t1")!;
    // Bumping these would tell the digest's inactivity check that a stalled
    // task had just been worked on.
    expect(task.updatedAt).toBe("untouched");
    expect(task.lastUpdatedAt).toBe("untouched");
  });

  it("writes nothing and sends nothing on a dry run", async () => {
    seedUser("u1");
    seedTask("t1");

    const result = await runDueTaskReminders({ now: NOW, dryRun: true });

    expect(result.candidates).toBe(1);
    expect(result.emailsSent).toBe(0);
    expect(sendTaskReminder).not.toHaveBeenCalled();
    expect(db.batchCommits).toBe(0);
    expect(db.read("tasks", "t1")!.dueReminderSentFor).toBeUndefined();
    expect(result.skipped).toContainEqual(
      expect.stringContaining("1 email(s) withheld")
    );
  });

  it("returns early and writes nothing when there is no work due", async () => {
    const result = await runDueTaskReminders({ now: NOW });

    expect(result.candidates).toBe(0);
    expect(result.emailsSent).toBe(0);
    expect(db.batchCommits).toBe(0);
  });
});
