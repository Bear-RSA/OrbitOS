import { describe, expect, it } from "vitest";

import {
  checkMembershipChange,
  DEFAULT_MAX_INTERNAL_MANAGEMENT,
  effectiveSeatLimit,
  isValidAdminPasscode,
} from "./rules";

describe("isValidAdminPasscode", () => {
  it("takes exactly six digits", () => {
    expect(isValidAdminPasscode("123456")).toBe(true);
    expect(isValidAdminPasscode("1234")).toBe(false);
    expect(isValidAdminPasscode("12345a")).toBe(false);
    expect(isValidAdminPasscode(123456)).toBe(false);
  });
});

describe("effectiveSeatLimit", () => {
  it("follows the plan once limits are enforced", () => {
    expect(effectiveSeatLimit({ tierLimit: 1, override: null, enforced: true })).toBe(1);
    expect(effectiveSeatLimit({ tierLimit: 2, override: null, enforced: true })).toBe(2);
  });

  it("gives everyone the default before limits are enforced", () => {
    expect(effectiveSeatLimit({ tierLimit: 1, override: null, enforced: false })).toBe(
      DEFAULT_MAX_INTERNAL_MANAGEMENT
    );
  });

  it("never lets a plan go above the default", () => {
    expect(effectiveSeatLimit({ tierLimit: -1, override: null, enforced: true })).toBe(3);
    expect(effectiveSeatLimit({ tierLimit: 10, override: null, enforced: true })).toBe(3);
  });

  it("lets a sold override go above it", () => {
    expect(effectiveSeatLimit({ tierLimit: 3, override: 6, enforced: true })).toBe(6);
  });
});

describe("checkMembershipChange", () => {
  const target = { id: "t" };

  it("adds someone while a seat is free", () => {
    expect(checkMembershipChange({ change: "add", members: ["a"], target, seatLimit: 2 })).toEqual({
      ok: true,
    });
  });

  it("refuses when every seat is taken", () => {
    expect(checkMembershipChange({ change: "add", members: ["a", "b"], target, seatLimit: 2 }).ok).toBe(false);
  });

  it("refuses someone outside the workspace", () => {
    expect(checkMembershipChange({ change: "add", members: ["a"], target: null, seatLimit: 3 }).ok).toBe(false);
  });

  it("removes someone while another stays", () => {
    expect(checkMembershipChange({ change: "remove", members: ["a", "t"], target, seatLimit: 3 }).ok).toBe(true);
  });

  it("never removes the last one", () => {
    expect(checkMembershipChange({ change: "remove", members: ["t"], target, seatLimit: 3 }).ok).toBe(false);
  });
});
