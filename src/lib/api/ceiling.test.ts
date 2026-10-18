import { describe, expect, it } from "vitest";
import {
  HARD_MAX_REQUESTS_PER_MINUTE,
  HARD_MAX_TOKENS_PER_USER,
  HARD_MAX_WRITES_PER_DAY,
  MAX_LIST_LIMIT,
  admitRequest,
  capListLimit,
  effectiveTokenLimit,
} from "@/lib/api/ceiling";
import { hashToken, generateToken, normaliseScopes, readBearer } from "@/lib/api/tokens";

/* ------------------------------------------------------------------ */
/*  API ceilings and token parsing                                     */
/*                                                                     */
/*  The caller is a program, so the direction that matters is the one  */
/*  that costs money: a loop must hit a wall, and nothing a client     */
/*  sends may widen one.                                               */
/* ------------------------------------------------------------------ */

const T0 = 1_700_000_000_000;

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
    let window;
    for (let i = 0; i < HARD_MAX_REQUESTS_PER_MINUTE; i++) {
      const result = admitRequest(window, false, T0 + i);
      expect(result.allowed).toBe(true);
      window = result.window;
    }
    const over = admitRequest(window, false, T0 + 1000);
    expect(over.allowed).toBe(false);
    expect(over.reason).toBe("minute");
  });

  it("opens a fresh minute once the old one has passed", () => {
    const full = { minuteStart: T0, minuteCount: HARD_MAX_REQUESTS_PER_MINUTE, dayStart: T0, writeCount: 0 };
    expect(admitRequest(full, false, T0 + 60_000).allowed).toBe(true);
  });

  it("caps writes per day without touching reads", () => {
    const spent = { minuteStart: T0, minuteCount: 0, dayStart: T0, writeCount: HARD_MAX_WRITES_PER_DAY };
    expect(admitRequest(spent, true, T0 + 10).reason).toBe("writes");
    expect(admitRequest(spent, false, T0 + 10).allowed).toBe(true);
    expect(admitRequest(spent, true, T0 + 86_400_000).allowed).toBe(true);
  });

  it("does not let a clock skewed into the future freeze the window", () => {
    const future = { minuteStart: T0 + 10_000_000, minuteCount: HARD_MAX_REQUESTS_PER_MINUTE, dayStart: T0, writeCount: 0 };
    expect(admitRequest(future, false, T0).allowed).toBe(true);
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
});
