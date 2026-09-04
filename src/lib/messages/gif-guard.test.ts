import { describe, expect, it } from "vitest";
import { createSearchGuard } from "@/lib/messages/gif-guard";

/* ------------------------------------------------------------------ */
/*  GIF search rate guard                                              */
/*                                                                     */
/*  The quota it protects is one key for the whole deployment, so the  */
/*  case that matters most is the GLOBAL ceiling: one workspace must   */
/*  not be able to empty the hour for everybody else.                  */
/* ------------------------------------------------------------------ */

const NOW = 1_000_000;
const HOUR = 60 * 60_000;

describe("per person", () => {
  it("lets an ordinary picker session through", () => {
    const guard = createSearchGuard(HOUR, 20, 80);
    for (let i = 0; i < 20; i++) {
      expect(guard.admit("sarah", NOW + i * 1_000).allowed).toBe(true);
    }
  });

  it("stops the one that runs away", () => {
    const guard = createSearchGuard(HOUR, 3, 80);
    for (let i = 0; i < 3; i++) guard.admit("sarah", NOW);

    const refused = guard.admit("sarah", NOW);
    expect(refused).toMatchObject({ allowed: false, reason: "user" });
  });

  it("leaves everybody else unaffected", () => {
    const guard = createSearchGuard(HOUR, 1, 80);
    expect(guard.admit("sarah", NOW).allowed).toBe(true);
    expect(guard.admit("sarah", NOW).allowed).toBe(false);
    expect(guard.admit("marcus", NOW).allowed).toBe(true);
  });

  it("forgives once the hour has passed", () => {
    const guard = createSearchGuard(HOUR, 1, 80);
    expect(guard.admit("sarah", NOW).allowed).toBe(true);
    expect(guard.admit("sarah", NOW + 30 * 60_000).allowed).toBe(false);
    expect(guard.admit("sarah", NOW + HOUR).allowed).toBe(true);
  });
});

describe("the shared quota", () => {
  it("stops a workspace emptying the hour for everyone", () => {
    const guard = createSearchGuard(HOUR, 100, 5);
    for (let i = 0; i < 5; i++) guard.admit("sarah", NOW);

    /* Sarah is under her own cap; the deployment is not. */
    const refused = guard.admit("marcus", NOW);
    expect(refused).toMatchObject({ allowed: false, reason: "global" });
  });

  it("does not spend a person's allowance on a globally refused request", () => {
    /* Two people spend the whole global allowance between them, each
       staying inside their own — so what stops Marcus below is the
       shared ceiling and nothing else. */
    const guard = createSearchGuard(HOUR, 2, 4);
    for (let i = 0; i < 2; i++) guard.admit("sarah", NOW);
    for (let i = 0; i < 2; i++) guard.admit("elena", NOW);

    /* Refused globally, twice. If these had cost Marcus his own count
       he would start the next hour already spent, for requests that
       never reached the provider at all. */
    expect(guard.admit("marcus", NOW)).toMatchObject({ reason: "global" });
    expect(guard.admit("marcus", NOW)).toMatchObject({ reason: "global" });

    /* A fresh hour: Marcus should still have his full allowance of 2. */
    expect(guard.admit("marcus", NOW + HOUR).allowed).toBe(true);
    expect(guard.admit("marcus", NOW + HOUR).allowed).toBe(true);
    expect(guard.admit("marcus", NOW + HOUR)).toMatchObject({ reason: "user" });
  });

  it("reports how long is left, not a fixed delay", () => {
    const guard = createSearchGuard(HOUR, 100, 1);
    guard.admit("sarah", NOW);

    const refused = guard.admit("sarah", NOW + 20 * 60_000);
    expect(refused.allowed === false && refused.retryAfterMs).toBe(40 * 60_000);
  });

  it("opens again on the next hour", () => {
    const guard = createSearchGuard(HOUR, 100, 1);
    expect(guard.admit("sarah", NOW).allowed).toBe(true);
    expect(guard.admit("marcus", NOW).allowed).toBe(false);
    expect(guard.admit("marcus", NOW + HOUR).allowed).toBe(true);
  });
});

describe("housekeeping", () => {
  it("does not grow without bound", () => {
    const guard = createSearchGuard(HOUR, 20, 1_000);
    for (let i = 0; i < 50; i++) guard.admit(`user${i}`, NOW);
    expect(guard.size()).toBe(50);

    /* Long after everyone has gone, one more request sweeps the rest. */
    guard.admit("late", NOW + 5 * HOUR);
    expect(guard.size()).toBe(1);
  });
});
