import { describe, expect, it } from "vitest";
import {
  SPRING,
  project,
  rubberband,
  settleTime,
  springEasing,
  springPosition,
  stepSpring,
} from "./spring";

describe("springPosition", () => {
  it("starts at rest and lands on the target", () => {
    expect(springPosition(0, SPRING.default)).toBe(0);
    expect(springPosition(10, SPRING.default)).toBeCloseTo(1, 6);
  });

  it("never overshoots when critically damped", () => {
    for (let t = 0; t < 2; t += 0.01) {
      expect(springPosition(t, SPRING.default)).toBeLessThanOrEqual(1);
    }
  });

  it("overshoots when under-damped", () => {
    let peak = 0;
    for (let t = 0; t < 2; t += 0.005) {
      peak = Math.max(peak, springPosition(t, SPRING.momentum));
    }
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.1);
  });
});

describe("settleTime", () => {
  it("is within 1% of the target at the reported time", () => {
    for (const cfg of Object.values(SPRING)) {
      const t = settleTime(cfg);
      expect(Math.abs(1 - springPosition(t, cfg))).toBeLessThanOrEqual(0.0101);
    }
  });

  it("scales with response", () => {
    expect(settleTime({ response: 0.8, dampingRatio: 1 })).toBeCloseTo(
      2 * settleTime({ response: 0.4, dampingRatio: 1 }),
      6
    );
  });
});

describe("springEasing", () => {
  it("produces a linear() list that begins at 0 and ends at 1", () => {
    const css = springEasing(SPRING.default, 8);
    expect(css.startsWith("linear(0, ")).toBe(true);
    expect(css.endsWith(", 1)")).toBe(true);
    expect(css.split(",").length).toBe(9);
  });
});

describe("stepSpring", () => {
  it("converges on the target from rest", () => {
    let s = { position: 0, velocity: 0 };
    for (let i = 0; i < 600; i += 1) {
      s = stepSpring(s.position, s.velocity, 100, SPRING.default, 1 / 120);
    }
    expect(s.position).toBeCloseTo(100, 1);
    expect(Math.abs(s.velocity)).toBeLessThan(0.1);
  });

  it("carries initial velocity through the first frames", () => {
    const rest = stepSpring(0, 0, 100, SPRING.default, 1 / 60);
    const thrown = stepSpring(0, 2000, 100, SPRING.default, 1 / 60);
    expect(thrown.position).toBeGreaterThan(rest.position);
  });
});

describe("project", () => {
  it("matches Apple's sample-code figures", () => {
    // 1000 px/s at the scroll-view rate travels ~499px before resting.
    expect(project(1000)).toBeCloseTo(499, 0);
    expect(project(-1000)).toBeCloseTo(-499, 0);
    expect(project(0)).toBe(0);
  });

  it("stops sooner at a faster deceleration rate", () => {
    expect(project(1000, 0.99)).toBeLessThan(project(1000, 0.998));
  });
});

describe("rubberband", () => {
  it("follows less the further past the edge the pointer goes", () => {
    const a = rubberband(50, 400);
    const b = rubberband(100, 400);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(2 * a);
  });

  it("preserves direction and never exceeds the pull", () => {
    expect(rubberband(-80, 400)).toBeLessThan(0);
    expect(Math.abs(rubberband(-80, 400))).toBeLessThan(80);
  });
});
