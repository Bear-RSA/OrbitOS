import { describe, expect, it } from "vitest";
import {
  PRESENCE_STALE_AFTER_MS,
  presenceTone,
  resolvePresence,
} from "@/lib/members/presence";

/* ------------------------------------------------------------------ */
/*  Presence                                                           */
/*                                                                     */
/*  A green dot is a claim that somebody is at their desk. The tests   */
/*  that matter are the ones where that claim would be false: a stale  */
/*  heartbeat, and no heartbeat at all.                                */
/* ------------------------------------------------------------------ */

const NOW = new Date("2026-09-04T12:00:00Z").getTime();
const MINUTE = 60_000;

describe("the heartbeat decides", () => {
  it("shows a recent pulse as available", () => {
    expect(
      resolvePresence({ operationalStatus: "available", lastActivityMs: NOW - MINUTE }, NOW)
    ).toBe("available");
  });

  it("survives one missed pulse", () => {
    /* useHeartbeat fires every 3 minutes, so 4 minutes is one skip. */
    expect(
      resolvePresence({ operationalStatus: "available", lastActivityMs: NOW - 4 * MINUTE }, NOW)
    ).toBe("available");
  });

  it("goes offline once the pulse is stale, whatever the stored status says", () => {
    const stale = NOW - PRESENCE_STALE_AFTER_MS - 1;
    expect(resolvePresence({ operationalStatus: "available", lastActivityMs: stale }, NOW)).toBe(
      "offline"
    );
    expect(resolvePresence({ operationalStatus: "focused", lastActivityMs: stale }, NOW)).toBe(
      "offline"
    );
  });

  it("treats a week-old pulse as offline, not available", () => {
    expect(
      resolvePresence(
        { operationalStatus: "available", lastActivityMs: NOW - 7 * 24 * 60 * MINUTE },
        NOW
      )
    ).toBe("offline");
  });

  it("treats no heartbeat at all as offline", () => {
    /* The case that was showing green: somebody never observed present. */
    expect(resolvePresence({ operationalStatus: "available", lastActivityMs: null }, NOW)).toBe(
      "offline"
    );
    expect(resolvePresence({ lastActivityMs: undefined }, NOW)).toBe("offline");
    expect(resolvePresence({}, NOW)).toBe("offline");
  });
});

describe("the stored status colours a live pulse", () => {
  const live = { lastActivityMs: NOW - MINUTE };

  it("honours a deliberate focused", () => {
    expect(resolvePresence({ ...live, operationalStatus: "focused" }, NOW)).toBe("focused");
  });

  it("honours a deliberate offline even while active", () => {
    expect(resolvePresence({ ...live, operationalStatus: "offline" }, NOW)).toBe("offline");
  });

  it("reads casing the way the rest of the app does", () => {
    expect(resolvePresence({ ...live, operationalStatus: "FOCUSED" }, NOW)).toBe("focused");
  });

  it("defaults a live pulse with no stated status to available", () => {
    expect(resolvePresence(live, NOW)).toBe("available");
  });
});

describe("tone", () => {
  it("gives every surface the same colour for the same state", () => {
    expect(presenceTone("available")).toBe("bg-orbit-green");
    expect(presenceTone("focused")).toBe("bg-orbit-amber");
    expect(presenceTone("offline")).toBe("bg-ink-faint");
  });
});
