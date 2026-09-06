import { describe, expect, it } from "vitest";
import {
  HARD_MAX_PARTICIPANTS,
  HARD_MAX_ROOM_MINUTES,
  HARD_MAX_TOKEN_SECONDS,
  capParticipants,
  capRoomExpiry,
  capTokenSeconds,
  groupCallSeats,
} from "@/lib/calls/ceiling";

/* ------------------------------------------------------------------ */
/*  Cost ceilings                                                      */
/*                                                                     */
/*  Always on, independent of the paywall, because each one maps to a  */
/*  Daily invoice. The tests are about the direction that costs money: */
/*  a caller must never ask for MORE than the ceiling and get it.      */
/* ------------------------------------------------------------------ */

describe("participants", () => {
  it("clamps a request above the ceiling", () => {
    expect(capParticipants(500)).toBe(HARD_MAX_PARTICIPANTS);
  });

  it("passes a request under the ceiling through", () => {
    expect(capParticipants(4)).toBe(4);
  });

  it("never returns fewer than two, since a call needs two ends", () => {
    expect(capParticipants(1)).toBe(2);
    expect(capParticipants(0)).toBe(2);
    expect(capParticipants(-10)).toBe(2);
  });

  it("does not let a non-number become an unbounded room", () => {
    expect(capParticipants(Number.NaN)).toBe(2);
    expect(capParticipants(Number.POSITIVE_INFINITY)).toBe(2);
  });
});

describe("token lifetime", () => {
  it("clamps a long-lived token request", () => {
    expect(capTokenSeconds(86_400)).toBe(HARD_MAX_TOKEN_SECONDS);
  });

  it("passes a short one through", () => {
    expect(capTokenSeconds(600)).toBe(600);
  });

  it("floors at a minute rather than minting a dead token", () => {
    expect(capTokenSeconds(0)).toBe(60);
    expect(capTokenSeconds(-1)).toBe(60);
    expect(capTokenSeconds(Number.NaN)).toBe(60);
  });
});

describe("room expiry", () => {
  const now = new Date("2026-09-02T10:00:00Z");

  it("clamps an expiry past the ceiling", () => {
    const asked = new Date(now.getTime() + 48 * 3_600_000);
    expect(capRoomExpiry(asked, now).getTime()).toBe(
      now.getTime() + HARD_MAX_ROOM_MINUTES * 60_000
    );
  });

  it("passes a reasonable expiry through", () => {
    const asked = new Date(now.getTime() + 30 * 60_000);
    expect(capRoomExpiry(asked, now).getTime()).toBe(asked.getTime());
  });

  it("pushes a past expiry forward rather than opening a dead room", () => {
    const asked = new Date(now.getTime() - 3_600_000);
    expect(capRoomExpiry(asked, now).getTime()).toBe(now.getTime() + 60_000);
  });

  it("falls back to the ceiling on an invalid date", () => {
    expect(capRoomExpiry(new Date("nonsense"), now).getTime()).toBe(
      now.getTime() + HARD_MAX_ROOM_MINUTES * 60_000
    );
  });
});

describe("group call seats", () => {
  /* The room is sized for the thread, not for the plan. A group of four
     on a plan that allows ten does not need six empty seats — it needs
     four, and every extra one is a body the provider could bill for. */
  it("sizes the room to the group when the plan is roomier", () => {
    expect(groupCallSeats(4, 10)).toBe(4);
  });

  it("sizes it to the plan when the group is bigger", () => {
    expect(groupCallSeats(20, 6)).toBe(6);
  });

  it("still clamps to the hard ceiling when the plan does not narrow it", () => {
    expect(groupCallSeats(40, -1)).toBe(HARD_MAX_PARTICIPANTS);
  });

  it("never goes below a pair", () => {
    expect(groupCallSeats(1, 10)).toBe(2);
  });
});
