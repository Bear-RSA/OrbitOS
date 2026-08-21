import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore } from "@/lib/testing/fake-firestore";

/* ------------------------------------------------------------------ */
/*  Scheduled run outcomes                                             */
/*                                                                     */
/*  This module exists because four scheduled mails failed silently on */
/*  2026-08-21 while every run reported success. So the tests are      */
/*  mostly about what the record must never be able to say: that a run */
/*  which delivered nothing was fine, that a crash was a quiet day, or */
/*  that a bookkeeping failure is worth taking a delivered mail down   */
/*  over.                                                              */
/* ------------------------------------------------------------------ */

const db = new FakeFirestore();
vi.mock("@/lib/firebase/admin", () => ({ adminDb: db }));

const { recordRunOutcome, recordRunCrash, readRecentRunFailures, statusOf } =
  await import("@/lib/tasks/run-log");

/** 18:00 SAST on the 21st — the moment the debrief cron fires. */
const NOW = new Date("2026-08-21T16:00:00Z");
const DAY = "2026-08-21";

beforeEach(() => {
  db.reset();
  vi.restoreAllMocks();
});

describe("statusOf", () => {
  it("calls a run with nothing refused ok, including an empty one", () => {
    expect(statusOf(4, 0)).toBe("ok");
    expect(statusOf(0, 0)).toBe("ok");
  });

  it("calls a run that delivered none of its mail failed", () => {
    expect(statusOf(0, 3)).toBe("failed");
  });

  it("calls a partial run degraded rather than failed", () => {
    // One bad address must not raise the same alarm as a dead provider.
    expect(statusOf(9, 1)).toBe("degraded");
  });
});

describe("recordRunOutcome", () => {
  it("records what the run did, under one id per job per day", async () => {
    await recordRunOutcome({
      job: "debrief",
      dayKey: DAY,
      emailsSent: 0,
      emailsFailed: 1,
      errors: ["someone@example.com (send failed: API key is invalid)"],
      now: NOW,
    });

    const write = db.directWrites.at(-1)!;
    expect(write.collection).toBe("scheduled_runs");
    expect(write.id).toBe(`debrief-${DAY}`);
    expect(write.data).toMatchObject({
      job: "debrief",
      dayKey: DAY,
      status: "failed",
      emailsSent: 0,
      emailsFailed: 1,
    });
  });

  it("merges onto the claim rather than replacing it", async () => {
    // The debrief claims its day on the same document before it spends any
    // money. An outcome that overwrote the claim would let a re-run mail
    // everybody a second time.
    db.seed("scheduled_runs", `debrief-${DAY}`, {
      job: "debrief",
      dayKey: DAY,
      claimedAt: Timestamp.fromDate(NOW),
    });

    await recordRunOutcome({
      job: "debrief",
      dayKey: DAY,
      emailsSent: 1,
      emailsFailed: 0,
      now: NOW,
    });

    const doc = await db.collection("scheduled_runs").doc(`debrief-${DAY}`).get();
    expect(doc.data()!.claimedAt).toBeDefined();
    expect(doc.data()!.status).toBe("ok");
  });

  it("caps the errors it keeps and counts the rest", async () => {
    await recordRunOutcome({
      job: "due-today",
      dayKey: DAY,
      emailsSent: 0,
      emailsFailed: 8,
      errors: Array.from({ length: 8 }, (_, i) => `error ${i}`),
      now: NOW,
    });

    const errors = db.directWrites.at(-1)!.data.errors as string[];
    expect(errors).toHaveLength(6);
    expect(errors.at(-1)).toBe("+ 3 more");
  });

  it("swallows a write failure instead of failing the run", async () => {
    // The mail is the product; this is the receipt. Losing the receipt is
    // not a reason to report a delivered mail as broken.
    vi.spyOn(db, "collection").mockImplementation(() => {
      throw new Error("Firestore unavailable");
    });

    await expect(
      recordRunOutcome({
        job: "owner-digest",
        dayKey: DAY,
        emailsSent: 3,
        emailsFailed: 0,
        now: NOW,
      })
    ).resolves.toBeUndefined();
  });
});

describe("recordRunCrash", () => {
  it("records a thrown run as a failure, never as a quiet day", async () => {
    await recordRunCrash("due-tomorrow", "Cannot read property of undefined", NOW);

    expect(db.directWrites.at(-1)!.data).toMatchObject({
      job: "due-tomorrow",
      status: "failed",
      emailsFailed: 1,
    });
  });
});

describe("readRecentRunFailures", () => {
  beforeEach(() => {
    db.seed("scheduled_runs", `debrief-${DAY}`, {
      job: "debrief",
      dayKey: DAY,
      status: "failed",
      emailsSent: 0,
      emailsFailed: 1,
      errors: ["send failed: API key is invalid"],
      finishedAt: Timestamp.fromDate(NOW),
    });
    db.seed("scheduled_runs", `due-today-${DAY}`, {
      job: "due-today",
      dayKey: DAY,
      status: "ok",
      emailsSent: 2,
      emailsFailed: 0,
      errors: [],
      finishedAt: Timestamp.fromDate(NOW),
    });
    db.seed("scheduled_runs", "debrief-2026-08-01", {
      job: "debrief",
      dayKey: "2026-08-01",
      status: "failed",
      emailsSent: 0,
      emailsFailed: 1,
      errors: ["ancient history"],
      finishedAt: Timestamp.fromDate(new Date("2026-08-01T16:00:00Z")),
    });
  });

  it("returns only the runs that went badly", async () => {
    const failures = await readRecentRunFailures({ now: NOW });

    expect(failures.map((f) => f.job)).toEqual(["debrief"]);
    expect(failures[0].errors).toEqual(["send failed: API key is invalid"]);
  });

  it("leaves older failures to the log", async () => {
    const failures = await readRecentRunFailures({ now: NOW, days: 3 });

    expect(failures.some((f) => f.dayKey === "2026-08-01")).toBe(false);
  });

  it("returns nothing rather than throwing when the read fails", async () => {
    // The banner must never become a second thing that is broken.
    vi.spyOn(db, "collection").mockImplementation(() => {
      throw new Error("Firestore unavailable");
    });

    await expect(readRecentRunFailures({ now: NOW })).resolves.toEqual([]);
  });
});
