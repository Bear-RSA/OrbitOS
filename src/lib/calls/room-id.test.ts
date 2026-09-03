import { describe, expect, it } from "vitest";
import { isRoomId, newRoomId } from "@/lib/calls/room-id";

/* ------------------------------------------------------------------ */
/*  Room ids                                                           */
/*                                                                     */
/*  The id is a capability: holding it is how a walk-in gets into a    */
/*  room. So what is tested is that it is unguessable and that the     */
/*  shape check cannot be talked into accepting something else.        */
/* ------------------------------------------------------------------ */

describe("minting", () => {
  it("produces the documented shape", () => {
    expect(newRoomId()).toMatch(/^r_[0-9a-f]{24}$/);
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newRoomId()));
    expect(ids.size).toBe(500);
  });
});

describe("validation", () => {
  it("accepts what it mints", () => {
    expect(isRoomId(newRoomId())).toBe(true);
  });

  it("rejects a path traversal dressed as an id", () => {
    expect(isRoomId("r_../../rooms/someone-else")).toBe(false);
    expect(isRoomId("r_000000000000000000000000/../x")).toBe(false);
  });

  it("rejects the wrong length", () => {
    expect(isRoomId("r_abc")).toBe(false);
    expect(isRoomId("r_aaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
  });

  it("rejects uppercase and non-hex", () => {
    expect(isRoomId("r_AAAAAAAAAAAAAAAAAAAAAAAA")).toBe(false);
    expect(isRoomId("r_zzzzzzzzzzzzzzzzzzzzzzzz")).toBe(false);
  });

  it("rejects a missing prefix", () => {
    expect(isRoomId("000000000000000000000000")).toBe(false);
  });

  it("rejects non-strings rather than throwing", () => {
    expect(isRoomId(null)).toBe(false);
    expect(isRoomId(undefined)).toBe(false);
    expect(isRoomId(42)).toBe(false);
    expect(isRoomId({})).toBe(false);
  });
});
