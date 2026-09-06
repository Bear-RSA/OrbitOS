import { describe, expect, it } from "vitest";
import { deadTokenIndexes, pushTokenId } from "@/lib/notifications/push-sender";

/* ------------------------------------------------------------------ */
/*  Push sending                                                       */
/*                                                                     */
/*  The pure halves. The send itself needs a push service; what needs  */
/*  testing is the pruning decision, because getting it backwards      */
/*  fails in two expensive and opposite directions — deleting a whole  */
/*  workspace's registrations over one bad minute at Google, or        */
/*  sending to dead devices on every call forever.                     */
/* ------------------------------------------------------------------ */

const ok = { success: true };
const failed = (code: string) => ({ success: false, error: { code } });

describe("pruning dead tokens", () => {
  it("keeps everything when every send lands", () => {
    expect(deadTokenIndexes([ok, ok, ok])).toEqual([]);
  });

  it("drops a token the push service no longer recognises", () => {
    const responses = [ok, failed("messaging/registration-token-not-registered"), ok];
    expect(deadTokenIndexes(responses)).toEqual([1]);
  });

  it("drops a malformed token", () => {
    expect(deadTokenIndexes([failed("messaging/invalid-registration-token")])).toEqual([0]);
  });

  /* The direction that matters. A transient failure is not evidence
     that a device is gone, and treating it as such would unsubscribe
     people for an outage they never noticed. */
  it("keeps a token that failed for a reason that will pass", () => {
    expect(deadTokenIndexes([failed("messaging/internal-error")])).toEqual([]);
    expect(deadTokenIndexes([failed("messaging/server-unavailable")])).toEqual([]);
    expect(deadTokenIndexes([failed("messaging/quota-exceeded")])).toEqual([]);
  });

  it("keeps a failure that arrived with no code at all", () => {
    expect(deadTokenIndexes([{ success: false }])).toEqual([]);
  });

  it("reports every dead index, not just the first", () => {
    const responses = [
      failed("messaging/registration-token-not-registered"),
      ok,
      failed("messaging/invalid-argument"),
    ];
    expect(deadTokenIndexes(responses)).toEqual([0, 2]);
  });
});

describe("token ids", () => {
  it("is stable, so re-registering a device updates one row", () => {
    expect(pushTokenId("abc")).toBe(pushTokenId("abc"));
  });

  it("separates two devices", () => {
    expect(pushTokenId("abc")).not.toBe(pushTokenId("abd"));
  });

  /* The token is a credential for interrupting somebody, and a document
     id ends up in every log line and stack trace that names the path. */
  it("does not carry the token itself", () => {
    const token = "fcm-token-that-should-not-appear-anywhere";
    expect(pushTokenId(token)).not.toContain(token);
    expect(pushTokenId(token)).toMatch(/^[0-9a-f]{32}$/);
  });
});
