import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore } from "@/lib/testing/fake-firestore";

/* ------------------------------------------------------------------ */
/*  Delivery events                                                    */
/*                                                                     */
/*  A guest invite can be accepted by Resend and still never reach an  */
/*  inbox. These tests are about the record that catches the second    */
/*  half — what got written, keyed how, and what the banner is and is  */
/*  not shown.                                                         */
/* ------------------------------------------------------------------ */

const db = new FakeFirestore();
vi.mock("@/lib/firebase/admin", () => ({ adminDb: db }));

const { recordDeliveryEvent, readRecentDeliveryFailures } = await import(
  "@/lib/tasks/mail-deliveries"
);

const NOW = new Date("2026-08-25T09:00:00Z");

beforeEach(() => {
  db.reset();
  vi.restoreAllMocks();
});

describe("recordDeliveryEvent", () => {
  it("records the event under the provider's own message id", async () => {
    await recordDeliveryEvent({
      messageId: "msg-1",
      type: "bounced",
      recipientEmail: "client@example.com",
      engagementId: "evt-1",
      reason: "mailbox does not exist",
      occurredAt: NOW.toISOString(),
    });

    const write = db.directWrites.at(-1)!;
    expect(write.collection).toBe("mail_deliveries");
    expect(write.id).toBe("msg-1");
    expect(write.data).toMatchObject({
      type: "bounced",
      recipientEmail: "client@example.com",
      engagementId: "evt-1",
      reason: "mailbox does not exist",
    });
  });

  it("merges a later event for the same message onto the earlier one", async () => {
    db.seed("mail_deliveries", "msg-1", {
      messageId: "msg-1",
      type: "delayed",
      recipientEmail: "client@example.com",
      engagementId: "evt-1",
      reason: null,
      occurredAt: Timestamp.fromDate(NOW),
    });

    await recordDeliveryEvent({
      messageId: "msg-1",
      type: "bounced",
      recipientEmail: "client@example.com",
      engagementId: "evt-1",
      reason: "mailbox full",
      occurredAt: NOW.toISOString(),
    });

    const doc = await db.collection("mail_deliveries").doc("msg-1").get();
    expect(doc.data()!.type).toBe("bounced");
  });

  it("swallows a write failure instead of throwing", async () => {
    vi.spyOn(db, "collection").mockImplementation(() => {
      throw new Error("Firestore unavailable");
    });

    await expect(
      recordDeliveryEvent({
        messageId: "msg-1",
        type: "delivered",
        recipientEmail: "client@example.com",
        engagementId: "evt-1",
        reason: null,
        occurredAt: NOW.toISOString(),
      })
    ).resolves.toBeUndefined();
  });
});

describe("readRecentDeliveryFailures", () => {
  beforeEach(() => {
    db.seed("mail_deliveries", "msg-bounced", {
      messageId: "msg-bounced",
      type: "bounced",
      recipientEmail: "bounced@example.com",
      engagementId: "evt-1",
      reason: "mailbox does not exist",
      occurredAt: Timestamp.fromDate(NOW),
    });
    db.seed("mail_deliveries", "msg-complained", {
      messageId: "msg-complained",
      type: "complained",
      recipientEmail: "annoyed@example.com",
      engagementId: "evt-2",
      reason: null,
      occurredAt: Timestamp.fromDate(NOW),
    });
    db.seed("mail_deliveries", "msg-delivered", {
      messageId: "msg-delivered",
      type: "delivered",
      recipientEmail: "fine@example.com",
      engagementId: "evt-3",
      reason: null,
      occurredAt: Timestamp.fromDate(NOW),
    });
    db.seed("mail_deliveries", "msg-old-bounce", {
      messageId: "msg-old-bounce",
      type: "bounced",
      recipientEmail: "old@example.com",
      engagementId: "evt-4",
      reason: "ancient history",
      occurredAt: Timestamp.fromDate(new Date("2026-08-01T00:00:00Z")),
    });
  });

  it("returns only bounces and complaints, not delivered or delayed", async () => {
    const failures = await readRecentDeliveryFailures({ now: NOW });

    expect(failures.map((f) => f.recipientEmail).sort()).toEqual([
      "annoyed@example.com",
      "bounced@example.com",
    ]);
  });

  it("leaves older failures outside the lookback window", async () => {
    const failures = await readRecentDeliveryFailures({ now: NOW, days: 3 });
    expect(failures.some((f) => f.recipientEmail === "old@example.com")).toBe(false);
  });

  it("returns nothing rather than throwing when the read fails", async () => {
    vi.spyOn(db, "collection").mockImplementation(() => {
      throw new Error("Firestore unavailable");
    });

    await expect(readRecentDeliveryFailures({ now: NOW })).resolves.toEqual([]);
  });
});
