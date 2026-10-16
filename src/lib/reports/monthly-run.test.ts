import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore } from "@/lib/testing/fake-firestore";

/* ------------------------------------------------------------------ */
/*  Monthly health report run                                          */
/*                                                                     */
/*  This spends a Resend send per copy, so the tests are about who is  */
/*  left out: plans without the report, owners who turned it off,      */
/*  quiet months, and a second run in the same month.                  */
/* ------------------------------------------------------------------ */

const db = new FakeFirestore();
vi.mock("@/lib/firebase/admin", () => ({ adminDb: db }));

type SendResult = { success: true } | { success: false; error: string };
const sendHealthReport = vi.fn<
  (params: { recipient: { email: string }; orgName: string }) => Promise<SendResult>
>(async () => ({ success: true }));
vi.mock("@/lib/email/sendHealthReport", () => ({ sendHealthReport }));

const resolveMonthlyReportLimit = vi.fn(async (_orgId: string) => -1);
vi.mock("@/lib/auth/permissions", () => ({ resolveMonthlyReportLimit }));

const { runMonthlyHealthReports, HARD_MAX_RECIPIENTS_PER_ORG } = await import("./monthly-run");

/** The 1st of October, so the report covers September. */
const NOW = new Date("2026-10-01T07:00:00Z");
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));

function seedOrg(orgId: string, ownerIds: string[], options: { quiet?: boolean } = {}) {
  db.seed("organizations", orgId, { name: `Studio ${orgId}`, ownerId: ownerIds[0] });
  db.seed("projects", `${orgId}-p`, { orgId, name: "Brand refresh" });
  ownerIds.forEach((uid, i) =>
    db.seed("users", uid, {
      orgId,
      role: "OWNER",
      name: uid,
      email: `${uid}@example.com`,
      createdAt: ts(`2026-01-0${i + 1}T00:00:00Z`),
    })
  );
  if (!options.quiet) {
    db.seed("tasks", `${orgId}-t`, {
      orgId,
      projectId: `${orgId}-p`,
      status: "done",
      assignedTo: [ownerIds[0]],
      createdAt: ts("2026-08-20T09:00:00Z"),
      completedAt: ts("2026-09-15T09:00:00Z"),
    });
  }
}

const sentTo = () => sendHealthReport.mock.calls.map(([p]) => p.recipient.email);

beforeEach(() => {
  db.reset();
  sendHealthReport.mockClear();
  sendHealthReport.mockImplementation(async () => ({ success: true }));
  resolveMonthlyReportLimit.mockReset();
  resolveMonthlyReportLimit.mockImplementation(async () => -1);
});

describe("runMonthlyHealthReports", () => {
  it("mails each owner about the month that just ended and stores the report", async () => {
    seedOrg("acme", ["ana", "ben"]);

    const result = await runMonthlyHealthReports({ now: NOW });

    expect(result.monthKey).toBe("2026-09");
    expect(sentTo()).toEqual(["ana@example.com", "ben@example.com"]);
    const stored = db.read("health_reports", "acme-2026-09");
    expect(stored).toMatchObject({ status: "sent", monthKey: "2026-09" });
    expect((stored!.report as { completed: number }).completed).toBe(1);
  });

  it("sends nothing to a plan without the report", async () => {
    seedOrg("free", ["ana"]);
    resolveMonthlyReportLimit.mockImplementation(async () => 0);

    const result = await runMonthlyHealthReports({ now: NOW });

    expect(sentTo()).toEqual([]);
    expect(result.skipped).toContain("free (plan does not include the report)");
  });

  it("sends a one-copy plan to the main owner", async () => {
    seedOrg("acme", ["ana", "ben"]);
    db.seed("organizations", "acme", { name: "Studio acme", ownerId: "ben" });
    resolveMonthlyReportLimit.mockImplementation(async () => 1);

    await runMonthlyHealthReports({ now: NOW });

    expect(sentTo()).toEqual(["ben@example.com"]);
  });

  it("never goes past the hard ceiling, whatever the plan says", async () => {
    const owners = Array.from({ length: HARD_MAX_RECIPIENTS_PER_ORG + 2 }, (_, i) => `o${i}`);
    seedOrg("big", owners);
    resolveMonthlyReportLimit.mockImplementation(async () => 50);

    await runMonthlyHealthReports({ now: NOW });

    expect(sentTo()).toHaveLength(HARD_MAX_RECIPIENTS_PER_ORG);
  });

  it("skips an owner who turned the report off", async () => {
    seedOrg("acme", ["ana", "ben"]);
    db.seed("users", "ben", {
      orgId: "acme",
      role: "OWNER",
      email: "ben@example.com",
      preferences: { monthlyReport: false },
    });

    await runMonthlyHealthReports({ now: NOW });

    expect(sentTo()).toEqual(["ana@example.com"]);
  });

  it("skips a quiet month", async () => {
    seedOrg("calm", ["ana"], { quiet: true });

    const result = await runMonthlyHealthReports({ now: NOW });

    expect(sentTo()).toEqual([]);
    expect(result.skipped).toContain("calm (quiet month)");
  });

  it("does not send twice in the same month", async () => {
    seedOrg("acme", ["ana"]);

    await runMonthlyHealthReports({ now: NOW });
    const second = await runMonthlyHealthReports({ now: NOW });

    expect(sentTo()).toEqual(["ana@example.com"]);
    expect(second.skipped).toContain("acme (already reported for 2026-09)");
  });

  it("lets a re-run retry a month whose every send failed", async () => {
    seedOrg("acme", ["ana"]);
    sendHealthReport.mockImplementation(async () => ({ success: false, error: "down" }));

    const first = await runMonthlyHealthReports({ now: NOW });
    expect(first.emailsFailed).toBe(1);
    expect(db.read("health_reports", "acme-2026-09")).toMatchObject({ status: "failed" });

    sendHealthReport.mockImplementation(async () => ({ success: true }));
    const second = await runMonthlyHealthReports({ now: NOW });

    expect(second.emailsSent).toBe(1);
    expect(db.read("health_reports", "acme-2026-09")).toMatchObject({ status: "sent" });
  });

  it("writes and sends nothing on a dry run", async () => {
    seedOrg("acme", ["ana"]);

    const result = await runMonthlyHealthReports({ now: NOW, dryRun: true });

    expect(sentTo()).toEqual([]);
    expect(db.ids("health_reports")).toEqual([]);
    expect(result.reported).toBe(1);
  });
});
