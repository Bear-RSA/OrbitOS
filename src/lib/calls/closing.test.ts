import { describe, expect, it } from "vitest";
import { CLOSING_WARNING_MS, closingWarning } from "@/lib/calls/closing";

describe("closingWarning", () => {
  const NOW = Date.parse("2026-10-08T14:00:00Z");

  it("stays quiet with no known deadline", () => {
    expect(closingWarning(null, NOW)).toBeNull();
    expect(closingWarning(undefined, NOW)).toBeNull();
    expect(closingWarning(Number.NaN, NOW)).toBeNull();
  });

  it("stays quiet until five minutes out", () => {
    expect(closingWarning(NOW + CLOSING_WARNING_MS + 1, NOW)).toBeNull();
  });

  it("appears at exactly five minutes", () => {
    expect(closingWarning(NOW + CLOSING_WARNING_MS, NOW)).toBe("This call ends in 5 minutes.");
  });

  it("rounds a partial minute up", () => {
    expect(closingWarning(NOW + 4 * 60_000 + 10_000, NOW)).toBe("This call ends in 5 minutes.");
  });

  it("uses the singular for the last full minute", () => {
    expect(closingWarning(NOW + 60_000, NOW)).toBe("This call ends in 1 minute.");
  });

  it("says under a minute for the final seconds", () => {
    expect(closingWarning(NOW + 59_000, NOW)).toBe("This call ends in under a minute.");
  });

  it("goes away once the room has closed", () => {
    expect(closingWarning(NOW, NOW)).toBeNull();
    expect(closingWarning(NOW - 1, NOW)).toBeNull();
  });
});
