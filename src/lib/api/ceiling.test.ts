import { describe, expect, it } from "vitest";
import {
  HARD_MAX_MAIL_WRITES_PER_DAY,
  HARD_MAX_REQUESTS_PER_MINUTE,
  HARD_MAX_TOKENS_PER_USER,
  HARD_MAX_WRITES_PER_DAY,
  MAX_AUTH_FAILURES_PER_MINUTE,
  MAX_LIST_LIMIT,
  admitRequest,
  capListLimit,
  effectiveTokenLimit,
  isAddressBlocked,
  recordAuthFailure,
  type ThrottleWindow,
} from "@/lib/api/ceiling";
import {
  DEFAULT_TOKEN_LIFETIME_DAYS,
  auditEntryId,
  generateToken,
  hashToken,
  isExpired,
  normaliseLifetime,
  normaliseScopes,
  readBearer,
} from "@/lib/api/tokens";

/* ------------------------------------------------------------------ */
/*  API guardrails                                                     */
/*                                                                     */
/*  The caller is a program, often a model acting on text it read, so  */
/*  the direction that matters is the one that does harm: a loop must  */
/*  hit a wall, mail must hit a lower one, a key must stop working on  */
/*  its date, and nothing a client sends may widen any of it.          */
/* ------------------------------------------------------------------ */

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;

function window(overrides: Partial<ThrottleWindow> = {}): ThrottleWindow {
  return { minuteStart: T0, minuteCount: 0, dayStart: T0, writeCount: 0, mailCount: 0, ...overrides };
}

describe("token limit", () => {
  it("lets the ceiling govern when the plan does not narrow it", () => {
    expect(effectiveTokenLimit(-1)).toBe(HARD_MAX_TOKENS_PER_USER);
  });

  it("never lets a plan widen the ceiling", () => {
    expect(effectiveTokenLimit(500)).toBe(HARD_MAX_TOKENS_PER_USER);
  });

  it("keeps 0 as the paid-plan gate", () => {
    expect(effectiveTokenLimit(0)).toBe(0);
    expect(effectiveTokenLimit(Number.NaN)).toBe(0);
  });
});

describe("list limit", () => {
  it("defaults junk to 50 and clamps large requests", () => {
    expect(capListLimit(undefined)).toBe(50);
    expect(capListLimit("abc")).toBe(50);
    expect(capListLimit("10")).toBe(10);
    expect(capListLimit(10_000)).toBe(MAX_LIST_LIMIT);
  });
});

describe("throttle", () => {
  it("refuses the request after the per-minute ceiling", () => {
    let current: ThrottleWindow | undefined;
    for (let i = 0; i < HARD_MAX_REQUESTS_PER_MINUTE; i++) {
      const result = admitRequest(current, "read", T0 + i);
      expect(result.allowed).toBe(true);
      current = result.window;
    }
    const over = admitRequest(current, "read", T0 + 1000);
    expect(over.allowed).toBe(false);
    expect(over.reason).toBe("minute");
  });

  it("opens a fresh minute once the old one has passed", () => {
    const full = window({ minuteCount: HARD_MAX_REQUESTS_PER_MINUTE });
    expect(admitRequest(full, "read", T0 + 60_000).allowed).toBe(true);
  });

  it("caps writes per day without touching reads", () => {
    const spent = window({ writeCount: HARD_MAX_WRITES_PER_DAY });
    expect(admitRequest(spent, "write", T0 + 10).reason).toBe("writes");
    expect(admitRequest(spent, "read", T0 + 10).allowed).toBe(true);
    expect(admitRequest(spent, "write", T0 + DAY).allowed).toBe(true);
  });

  it("caps mail-sending writes far below other writes", () => {
    const mailed = window({ mailCount: HARD_MAX_MAIL_WRITES_PER_DAY });
    expect(admitRequest(mailed, "mail", T0 + 10).reason).toBe("mail");
    expect(admitRequest(mailed, "write", T0 + 10).allowed).toBe(true);
    expect(HARD_MAX_MAIL_WRITES_PER_DAY).toBeLessThan(HARD_MAX_WRITES_PER_DAY);
  });

  it("counts a mail-sending write against the write ceiling too", () => {
    const result = admitRequest(undefined, "mail", T0);
    expect(result.window.writeCount).toBe(1);
    expect(result.window.mailCount).toBe(1);
  });

  it("does not let a clock skewed into the future freeze the window", () => {
    const future = window({ minuteStart: T0 + 10_000_000, minuteCount: HARD_MAX_REQUESTS_PER_MINUTE });
    expect(admitRequest(future, "read", T0).allowed).toBe(true);
  });
});

describe("failed-auth limiter", () => {
  it("blocks an address after the failure ceiling, and only that address", () => {
    const failures = new Map<string, { start: number; count: number }>();
    for (let i = 0; i < MAX_AUTH_FAILURES_PER_MINUTE; i++) recordAuthFailure(failures, "1.2.3.4", T0 + i);
    expect(isAddressBlocked(failures, "1.2.3.4", T0 + 100)).toBe(true);
    expect(isAddressBlocked(failures, "5.6.7.8", T0 + 100)).toBe(false);
  });

  it("lets the address back in after a minute", () => {
    const failures = new Map<string, { start: number; count: number }>();
    for (let i = 0; i < MAX_AUTH_FAILURES_PER_MINUTE; i++) recordAuthFailure(failures, "1.2.3.4", T0);
    expect(isAddressBlocked(failures, "1.2.3.4", T0 + 60_000)).toBe(false);
  });
});

describe("bearer parsing", () => {
  it("accepts a token we issued", () => {
    const token = generateToken();
    expect(readBearer(`Bearer ${token}`)).toBe(token);
  });

  it("rejects anything not shaped like ours before it costs a read", () => {
    expect(readBearer(null)).toBeNull();
    expect(readBearer("Bearer abc")).toBeNull();
    expect(readBearer(`Basic ${generateToken()}`)).toBeNull();
    expect(readBearer("Bearer orb_short")).toBeNull();
  });

  it("hashes deterministically and never to the plaintext", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });
});

describe("scopes", () => {
  it("gives write read alongside it, and defaults to read-only", () => {
    expect(normaliseScopes(["write"])).toEqual(["read", "write"]);
    expect(normaliseScopes(["admin"])).toEqual(["read"]);
    expect(normaliseScopes(undefined)).toEqual(["read"]);
  });

  it("grants emailing outsiders only on top of write", () => {
    expect(normaliseScopes(["write", "guests"])).toEqual(["read", "write", "guests"]);
    expect(normaliseScopes(["guests"])).toEqual(["read"]);
  });
});

describe("expiry", () => {
  const at = (ms: number) => ({ expiresAt: { toMillis: () => ms } as FirebaseFirestore.Timestamp });

  it("snaps anything unoffered to the default, so there is no never-expiring key", () => {
    expect(normaliseLifetime(30)).toBe(30);
    expect(normaliseLifetime(0)).toBe(DEFAULT_TOKEN_LIFETIME_DAYS);
    expect(normaliseLifetime(100_000)).toBe(DEFAULT_TOKEN_LIFETIME_DAYS);
    expect(normaliseLifetime("365")).toBe(DEFAULT_TOKEN_LIFETIME_DAYS);
  });

  it("refuses a token from the instant it expires", () => {
    expect(isExpired(at(T0), T0 - 1)).toBe(false);
    expect(isExpired(at(T0), T0)).toBe(true);
  });
});

describe("audit ids", () => {
  it("sort newest first within one person", () => {
    const older = auditEntryId("u1", T0);
    const newer = auditEntryId("u1", T0 + 1000);
    expect(newer < older).toBe(true);
    expect(older.startsWith("u1_")).toBe(true);
  });
});
