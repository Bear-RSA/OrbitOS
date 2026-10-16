import { describe, expect, it } from "vitest";

import { receiptFor } from "./receipts";

const dm = {
  type: "dm" as const,
  senderId: "me",
  sentAtMs: 1000,
  participantIds: ["me", "you"],
  lastReadAt: {},
  lastDeliveredAt: {},
};

describe("receiptFor in a dm", () => {
  it("says Sent until their OrbitOS picks it up", () => {
    expect(receiptFor(dm)?.label).toBe("Sent");
  });

  it("says Delivered once it reaches them", () => {
    expect(receiptFor({ ...dm, lastDeliveredAt: { you: 1200 } })?.label).toBe("Delivered");
  });

  it("says Read once they open the thread after it", () => {
    expect(receiptFor({ ...dm, lastReadAt: { you: 1500 } })?.state).toBe("read");
  });

  it("doesn't count a read from before the message", () => {
    expect(receiptFor({ ...dm, lastReadAt: { you: 900 } })?.state).toBe("sent");
  });

  it("says Sending while the timestamp is on its way", () => {
    expect(receiptFor({ ...dm, sentAtMs: null })?.state).toBe("sending");
  });
});

describe("receiptFor in a group", () => {
  const group = { ...dm, type: "group" as const, participantIds: ["me", "a", "b", "c"] };

  it("counts who it has reached and who has read it", () => {
    expect(receiptFor({ ...group, lastDeliveredAt: { a: 1100 } })?.label).toBe("Delivered to 1 of 3");
    expect(receiptFor({ ...group, lastReadAt: { a: 1100, b: 1100 } })?.label).toBe("Read by 2 of 3");
    expect(receiptFor({ ...group, lastReadAt: { a: 2000, b: 2000, c: 2000 } })?.label).toBe("Read by everyone");
  });
});

describe("receiptFor in Town Hall", () => {
  it("shows nothing", () => {
    expect(receiptFor({ ...dm, type: "townhall" })).toBeNull();
  });
});
