import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore, type Row } from "@/lib/testing/fake-firestore";

/* ------------------------------------------------------------------ */
/*  End-of-day debrief                                                 */
/*                                                                     */
/*  Two things make this module worth testing hard. It spends money on */
/*  every run, so the questions are the same ones the reminder suite   */
/*  asks: who is EXCLUDED, and what stops a second send. And it is the */
/*  only consumer of the activity log, so it is where a mistake in     */
/*  reading that log shows up — an event filed under the wrong person, */
/*  the wrong section, or twice.                                       */
/* ------------------------------------------------------------------ */

const db = new FakeFirestore();
vi.mock("@/lib/firebase/admin", () => ({ adminDb: db }));

/* Pinned rather than left to the module's fallback, so the URL assertions
   below test how a link is BUILT and not what the production default
   happens to be. Leaving it unset made this suite fail the day that
   default moved from the apex to www. */
process.env.NEXT_PUBLIC_APP_URL = "https://www.orbit-os.co.za";

interface DebriefCall {
  recipient: { name: string; email: string };
  orgName: string;
  dayKey: string;
  sections: {
    created: { title: string }[];
    assigned: { title: string; detail?: string | null }[];
    moved: { title: string; detail?: string | null }[];
    completed: { title: string }[];
  };
  trial?: { number: number; allowance: number; upgradeUrl: string };
}

/** Free tier by default; individual tests raise it to stand for a paid one. */
const resolveDebriefAllowance = vi.fn(async () => 3);
vi.mock("@/lib/auth/permissions", () => ({ resolveDebriefAllowance }));

type SendResult = { success: true } | { success: false; error: string };

const sendDailyDebrief = vi.fn<(params: DebriefCall) => Promise<SendResult>>(
  async () => ({ success: true })
);

// `debriefTotal` is pure arithmetic over the sections and the module under
// test relies on it to decide who gets skipped, so it is kept real.
vi.mock("@/lib/email/sendDailyDebrief", () => ({
  sendDailyDebrief,
  debriefTotal: (s: DebriefCall["sections"]) =>
    s.created.length + s.assigned.length + s.moved.length + s.completed.length,
}));

const { runDailyDebrief } = await import("@/lib/tasks/debrief");

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

/** 18:00 SAST on the 20th is 16:00 UTC — the moment the cron fires. */
const NOW = new Date("2026-08-20T16:00:00Z");
const DAY = "2026-08-20";

/** Comfortably inside the 18:00-to-18:00 window ending at NOW. */
function at(iso: string): Timestamp {
  return Timestamp.fromDate(new Date(iso));
}

const MIDDAY = at("2026-08-20T10:00:00Z");

let eventSeq = 0;

function seedEvent(overrides: Row = {}) {
  eventSeq += 1;
  db.seed("activity", `ev-${eventSeq}`, {
    eventType: "DIRECTIVE_CREATED",
    orgId: "org-1",
    projectId: "proj-1",
    actor: { uid: "u1", name: "Ada" },
    metadata: { taskId: "t1", taskTitle: "Ship the thing" },
    timestamp: MIDDAY,
    ...overrides,
  });
}

function seedUser(uid: string, overrides: Row = {}) {
  db.seed("users", uid, {
    name: uid === "u1" ? "Ada" : "Grace",
    email: `${uid}@example.com`,
    orgId: "org-1",
    ...overrides,
  });
}

beforeEach(() => {
  db.reset();
  eventSeq = 0;
  sendDailyDebrief.mockClear();
  sendDailyDebrief.mockImplementation(async () => ({ success: true }));
  resolveDebriefAllowance.mockClear();
  resolveDebriefAllowance.mockImplementation(async () => 3);
  db.seed("organizations", "org-1", { name: "Mirai Stack" });
  seedUser("u1");
  seedUser("u2");
});

/** The sections the one and only send was called with. */
function sentSections() {
  expect(sendDailyDebrief).toHaveBeenCalledTimes(1);
  return sendDailyDebrief.mock.calls[0][0].sections;
}

/* ------------------------------------------------------------------ */
/*  Sectioning                                                         */
/* ------------------------------------------------------------------ */

describe("runDailyDebrief — sectioning", () => {
  it("files a created task under Created for its author", async () => {
    seedEvent();

    const result = await runDailyDebrief({ now: NOW });

    expect(result.dayKey).toBe(DAY);
    expect(sentSections().created).toHaveLength(1);
    expect(sentSections().created[0].title).toBe("Ship the thing");
  });

  it("files an assignment under the assignee, not the assigner", async () => {
    seedEvent({
      eventType: "DIRECTIVE_ASSIGNED",
      actor: { uid: "u1", name: "Ada" },
      metadata: { taskId: "t1", taskTitle: "Ship the thing", assigneeUids: ["u2"] },
    });

    await runDailyDebrief({ now: NOW });

    const call = sendDailyDebrief.mock.calls[0][0];
    expect(call.recipient.email).toBe("u2@example.com");
    expect(call.sections.assigned).toHaveLength(1);
    expect(call.sections.assigned[0].detail).toBe("from Ada");
  });

  it("does not report work somebody handed to themselves", async () => {
    seedEvent({
      eventType: "DIRECTIVE_ASSIGNED",
      actor: { uid: "u1", name: "Ada" },
      metadata: { taskId: "t1", taskTitle: "Ship the thing", assigneeUids: ["u1"] },
    });

    await runDailyDebrief({ now: NOW });

    expect(sendDailyDebrief).not.toHaveBeenCalled();
  });

  it("separates a completion from an ordinary move", async () => {
    seedEvent({
      eventType: "DIRECTIVE_TRANSITION",
      metadata: { taskId: "t1", taskTitle: "Ship the thing", from: "todo", to: "doing" },
    });
    seedEvent({
      eventType: "DIRECTIVE_TRANSITION",
      metadata: { taskId: "t2", taskTitle: "Close the loop", from: "doing", to: "done" },
    });

    await runDailyDebrief({ now: NOW });

    const sections = sentSections();
    expect(sections.moved.map((entry) => entry.title)).toEqual(["Ship the thing"]);
    expect(sections.completed.map((entry) => entry.title)).toEqual(["Close the loop"]);
  });

  it("collapses a task moved twice into the day's net movement", async () => {
    seedEvent({
      eventType: "DIRECTIVE_TRANSITION",
      timestamp: at("2026-08-20T08:00:00Z"),
      metadata: { taskId: "t1", taskTitle: "Ship the thing", from: "todo", to: "doing" },
    });
    seedEvent({
      eventType: "DIRECTIVE_TRANSITION",
      timestamp: at("2026-08-20T11:00:00Z"),
      metadata: { taskId: "t1", taskTitle: "Ship the thing", from: "doing", to: "todo" },
    });

    const sections = (await runDailyDebrief({ now: NOW }), sentSections());

    expect(sections.moved).toHaveLength(1);
    expect(sections.moved[0].detail).toBe("todo → todo");
  });

  it("does not also list a finished task as merely moved", async () => {
    seedEvent({
      eventType: "DIRECTIVE_TRANSITION",
      metadata: { taskId: "t1", taskTitle: "Ship the thing", from: "todo", to: "doing" },
    });
    seedEvent({
      eventType: "DIRECTIVE_TRANSITION",
      metadata: { taskId: "t1", taskTitle: "Ship the thing", from: "doing", to: "done" },
    });

    await runDailyDebrief({ now: NOW });

    const sections = sentSections();
    expect(sections.moved).toHaveLength(0);
    expect(sections.completed).toHaveLength(1);
  });

  it("ignores events that are not about tasks", async () => {
    seedEvent({ eventType: "ASSET_INGESTED", metadata: { fileName: "brief.pdf" } });

    await runDailyDebrief({ now: NOW });

    expect(sendDailyDebrief).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  Window                                                             */
/* ------------------------------------------------------------------ */

describe("runDailyDebrief — window", () => {
  it("covers the eighteen hours before the run", async () => {
    seedEvent({ timestamp: at("2026-08-20T15:59:00Z") });

    await runDailyDebrief({ now: NOW });

    expect(sendDailyDebrief).toHaveBeenCalledTimes(1);
  });

  it("reaches back to the previous evening rather than to midnight", async () => {
    // 20:00 SAST yesterday. A midnight-to-18:00 window would drop this
    // entirely — it is exactly the evening work the rolling window keeps.
    seedEvent({ timestamp: at("2026-08-19T18:00:00Z") });

    await runDailyDebrief({ now: NOW });

    expect(sendDailyDebrief).toHaveBeenCalledTimes(1);
  });

  it("excludes anything already covered by yesterday's debrief", async () => {
    // 17:59 SAST yesterday — one minute before the previous cutoff.
    seedEvent({ timestamp: at("2026-08-19T15:59:00Z") });

    await runDailyDebrief({ now: NOW });

    expect(sendDailyDebrief).not.toHaveBeenCalled();
  });

  it("excludes anything after the cutoff, leaving it for tomorrow", async () => {
    seedEvent({ timestamp: at("2026-08-20T16:30:00Z") });

    await runDailyDebrief({ now: NOW });

    expect(sendDailyDebrief).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  Recipients                                                         */
/* ------------------------------------------------------------------ */

describe("runDailyDebrief — recipients", () => {
  it("never mails somebody with nothing to report", async () => {
    seedEvent({ actor: { uid: "u1", name: "Ada" } });

    await runDailyDebrief({ now: NOW });

    const recipients = sendDailyDebrief.mock.calls.map((c) => c[0].recipient.email);
    expect(recipients).toEqual(["u1@example.com"]);
  });

  it("honours the notification preference", async () => {
    seedUser("u1", { preferences: { dailyDebrief: false } });
    seedEvent();

    const result = await runDailyDebrief({ now: NOW });

    expect(sendDailyDebrief).not.toHaveBeenCalled();
    expect(result.skipped).toContain("u1@example.com (debrief disabled)");
  });

  it("sends by default when preferences were never set", async () => {
    seedUser("u1", { preferences: undefined });
    seedEvent();

    await runDailyDebrief({ now: NOW });

    expect(sendDailyDebrief).toHaveBeenCalledTimes(1);
  });

  it("skips an actor with no user record", async () => {
    seedEvent({ actor: { uid: "ghost", name: "Ghost" } });

    const result = await runDailyDebrief({ now: NOW });

    expect(sendDailyDebrief).not.toHaveBeenCalled();
    expect(result.skipped).toContain("ghost (no user record or no email)");
  });

  it("names each recipient's workspace", async () => {
    seedEvent();

    await runDailyDebrief({ now: NOW });

    expect(sendDailyDebrief.mock.calls[0][0].orgName).toBe("Mirai Stack");
  });

  it("gives two active people one mail each", async () => {
    seedEvent({ actor: { uid: "u1", name: "Ada" } });
    seedEvent({
      actor: { uid: "u2", name: "Grace" },
      metadata: { taskId: "t2", taskTitle: "Close the loop" },
    });

    await runDailyDebrief({ now: NOW });

    expect(sendDailyDebrief).toHaveBeenCalledTimes(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Idempotency                                                        */
/* ------------------------------------------------------------------ */

describe("runDailyDebrief — idempotency", () => {
  it("sends nothing on a second run of the same day", async () => {
    seedEvent();

    await runDailyDebrief({ now: NOW });
    sendDailyDebrief.mockClear();

    const second = await runDailyDebrief({ now: NOW });

    expect(sendDailyDebrief).not.toHaveBeenCalled();
    expect(second.skipped[0]).toContain("already ran");
  });

  it("re-runs a claimed day when forced", async () => {
    seedEvent();

    await runDailyDebrief({ now: NOW });
    sendDailyDebrief.mockClear();

    await runDailyDebrief({ now: NOW, force: true });

    expect(sendDailyDebrief).toHaveBeenCalledTimes(1);
  });

  it("writes nothing and sends nothing on a dry run", async () => {
    seedEvent();

    const result = await runDailyDebrief({ now: NOW, dryRun: true });

    expect(sendDailyDebrief).not.toHaveBeenCalled();
    expect(result.candidates).toBe(1);
    expect(db.directWrites).toHaveLength(0);
  });

  it("leaves the day unclaimed after a dry run", async () => {
    seedEvent();

    await runDailyDebrief({ now: NOW, dryRun: true });
    const real = await runDailyDebrief({ now: NOW });

    expect(real.emailsSent).toBe(1);
  });

  it("reports a send that failed", async () => {
    seedEvent();
    sendDailyDebrief.mockImplementation(async () => ({
      success: false,
      error: "rate limited",
    }));

    const result = await runDailyDebrief({ now: NOW });

    expect(result.emailsSent).toBe(0);
    expect(result.emailsFailed).toBe(1);
    expect(result.skipped[0]).toContain("rate limited");
  });

  it("returns early when nothing happened at all", async () => {
    const result = await runDailyDebrief({ now: NOW });

    expect(result.candidates).toBe(0);
    expect(result.emailsSent).toBe(0);
    expect(sendDailyDebrief).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  Free-tier trial                                                    */
/*                                                                     */
/*  The debrief is a paid feature with a three-mail trial. What must   */
/*  hold: the count is per PERSON, it survives across days, the third  */
/*  mail is the one that says so, the fourth never arrives, and a      */
/*  failed send does not quietly cost somebody one of their three.     */
/* ------------------------------------------------------------------ */

describe("runDailyDebrief — free-tier trial", () => {
  /** Runs a debrief on a fresh day so the claim does not block it. */
  async function runOnDay(day: string) {
    seedEvent({ timestamp: at(`${day}T10:00:00Z`) });
    return runDailyDebrief({ now: new Date(`${day}T16:00:00Z`) });
  }

  it("counts the first mail as one of three", async () => {
    seedEvent();

    await runDailyDebrief({ now: NOW });

    expect(sendDailyDebrief.mock.calls[0][0].trial).toEqual({
      number: 1,
      allowance: 3,
      upgradeUrl: "https://www.orbit-os.co.za/pricing",
    });
  });

  it("increments the recipient's counter after a successful send", async () => {
    seedEvent();

    await runDailyDebrief({ now: NOW });

    expect(db.read("users", "u1")!.debriefsSent).toBe(1);
  });

  it("carries the count across days", async () => {
    await runOnDay("2026-08-18");
    await runOnDay("2026-08-19");

    expect(db.read("users", "u1")!.debriefsSent).toBe(2);
    expect(sendDailyDebrief.mock.calls[1][0].trial?.number).toBe(2);
  });

  it("marks the third as the last one", async () => {
    db.seed("users", "u1", {
      name: "Ada",
      email: "u1@example.com",
      orgId: "org-1",
      debriefsSent: 2,
    });
    seedEvent();

    await runDailyDebrief({ now: NOW });

    const trial = sendDailyDebrief.mock.calls[0][0].trial!;
    expect(trial.number).toBe(3);
    expect(trial.allowance).toBe(3);
  });

  it("sends nothing once the allowance is spent", async () => {
    db.seed("users", "u1", {
      name: "Ada",
      email: "u1@example.com",
      orgId: "org-1",
      debriefsSent: 3,
    });
    seedEvent();

    const result = await runDailyDebrief({ now: NOW });

    expect(sendDailyDebrief).not.toHaveBeenCalled();
    expect(result.skipped).toContain("u1@example.com (free debrief allowance used)");
  });

  it("does not spend an allowance on a send that failed", async () => {
    seedEvent();
    sendDailyDebrief.mockImplementation(async () => ({
      success: false,
      error: "rate limited",
    }));

    await runDailyDebrief({ now: NOW });

    expect(db.read("users", "u1")!.debriefsSent).toBeUndefined();
  });

  it("meters each person separately", async () => {
    db.seed("users", "u1", {
      name: "Ada",
      email: "u1@example.com",
      orgId: "org-1",
      debriefsSent: 3,
    });
    seedEvent({ actor: { uid: "u1", name: "Ada" } });
    seedEvent({
      actor: { uid: "u2", name: "Grace" },
      metadata: { taskId: "t2", taskTitle: "Close the loop" },
    });

    await runDailyDebrief({ now: NOW });

    const recipients = sendDailyDebrief.mock.calls.map((c) => c[0].recipient.email);
    expect(recipients).toEqual(["u2@example.com"]);
  });

  it("does not meter or mention billing on a paid tier", async () => {
    resolveDebriefAllowance.mockImplementation(async () => -1);
    db.seed("users", "u1", {
      name: "Ada",
      email: "u1@example.com",
      orgId: "org-1",
      debriefsSent: 99,
    });
    seedEvent();

    await runDailyDebrief({ now: NOW });

    expect(sendDailyDebrief).toHaveBeenCalledTimes(1);
    expect(sendDailyDebrief.mock.calls[0][0].trial).toBeUndefined();
    // Nothing to count when nothing is metered.
    expect(db.read("users", "u1")!.debriefsSent).toBe(99);
  });

  it("asks the tier once per workspace, not once per person", async () => {
    seedEvent({ actor: { uid: "u1", name: "Ada" } });
    seedEvent({
      actor: { uid: "u2", name: "Grace" },
      metadata: { taskId: "t2", taskTitle: "Close the loop" },
    });

    await runDailyDebrief({ now: NOW });

    expect(resolveDebriefAllowance).toHaveBeenCalledTimes(1);
  });
});
