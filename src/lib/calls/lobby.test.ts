import { describe, expect, it } from "vitest";
import { LOBBY_POLL_MS } from "@/lib/calls/access";
import { lobbyRetryDelay } from "@/lib/calls/lobby";

describe("lobbyRetryDelay", () => {
  const NOW = Date.parse("2026-10-08T12:40:00Z");

  it("asks every few seconds while waiting on the organizer", () => {
    expect(lobbyRetryDelay({ kind: "host" }, NOW)).toBe(LOBBY_POLL_MS);
  });

  it("asks again when the room opens", () => {
    expect(lobbyRetryDelay({ kind: "early", opensAt: NOW + 10 * 60_000 }, NOW)).toBe(10 * 60_000);
  });

  it("never asks faster than the poll interval, whatever the device clock says", () => {
    expect(lobbyRetryDelay({ kind: "early", opensAt: NOW - 60_000 }, NOW)).toBe(LOBBY_POLL_MS);
  });
});
