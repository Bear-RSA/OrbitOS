import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedValue, VelocityTracker } from "./animated-value";
import { SPRING } from "./spring";
import { decideRelease } from "./sheet";

/* A frame clock we can turn by hand: 60fps, one rAF callback per frame. */
function installFrameClock() {
  let now = 0;
  let queue: FrameRequestCallback[] = [];
  let nextId = 1;
  const handles = new Map<number, FrameRequestCallback>();

  vi.stubGlobal("performance", { now: () => now });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId++;
    handles.set(id, cb);
    queue.push(cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    const cb = handles.get(id);
    handles.delete(id);
    queue = queue.filter((q) => q !== cb);
  });

  return {
    step(frames = 1) {
      for (let i = 0; i < frames; i += 1) {
        now += 1000 / 60;
        const batch = queue;
        queue = [];
        batch.forEach((cb) => cb(now));
      }
    },
    pending: () => queue.length,
  };
}

describe("AnimatedValue", () => {
  let clock: ReturnType<typeof installFrameClock>;
  beforeEach(() => {
    clock = installFrameClock();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("springs to the target and stops its frame loop at rest", () => {
    const v = new AnimatedValue(300);
    const seen: number[] = [];
    v.subscribe((x) => seen.push(x));
    v.animateTo(0, { config: SPRING.default });

    clock.step(120); // two seconds
    expect(v.get()).toBe(0);
    expect(v.isAnimating()).toBe(false);
    expect(clock.pending()).toBe(0);
    // Monotonic: a critically damped spring never crosses the target.
    for (let i = 1; i < seen.length; i += 1) expect(seen[i]).toBeLessThanOrEqual(seen[i - 1] + 1e-9);
  });

  it("fires onRest once the target is reached", () => {
    const v = new AnimatedValue(100);
    const onRest = vi.fn();
    v.animateTo(0, { onRest });
    clock.step(10);
    expect(onRest).not.toHaveBeenCalled();
    clock.step(200);
    expect(onRest).toHaveBeenCalledTimes(1);
  });

  it("can be grabbed mid-flight: set() stops the spring where it is", () => {
    const v = new AnimatedValue(300);
    v.animateTo(0);
    clock.step(8);
    const midway = v.get();
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(300);

    v.set(midway + 5);
    expect(v.isAnimating()).toBe(false);
    clock.step(30);
    expect(v.get()).toBe(midway + 5); // nothing moved it
  });

  it("retargets without a velocity discontinuity", () => {
    const v = new AnimatedValue(0);
    v.animateTo(300);
    clock.step(6);
    const velocityBefore = v.getVelocity();
    v.animateTo(0); // reverse
    expect(v.getVelocity()).toBe(velocityBefore); // carried through, not zeroed
    clock.step(1);
    // Still travelling in the old direction for a moment — a brick wall
    // would have it moving toward 0 immediately.
    expect(v.getVelocity()).toBeGreaterThan(0);
  });

  it("carries a thrown velocity into the first frames", () => {
    const rest = new AnimatedValue(0);
    const thrown = new AnimatedValue(0);
    rest.animateTo(300);
    thrown.animateTo(300, { velocity: 2000 });
    clock.step(3);
    expect(thrown.get()).toBeGreaterThan(rest.get());
  });
});

describe("VelocityTracker", () => {
  it("reports px/s over the recent window", () => {
    const t = new VelocityTracker();
    t.push(0, 0);
    t.push(10, 16);
    t.push(20, 32);
    t.push(30, 48);
    expect(t.velocity(48)).toBeCloseTo(625, 0);
  });

  it("reports zero after the finger paused before lifting", () => {
    const t = new VelocityTracker();
    t.push(0, 0);
    t.push(40, 16);
    expect(t.velocity(200)).toBe(0);
  });
});

describe("decideRelease", () => {
  const height = 600;

  it("dismisses a fast flick from near the top", () => {
    expect(decideRelease(40, 1500, height)).toBe("dismiss");
  });

  it("returns a slow drag that stopped short of halfway", () => {
    expect(decideRelease(200, 0, height)).toBe("return");
  });

  it("dismisses a moderate throw whose projection crosses halfway", () => {
    // 200px + project(600px/s) ≈ 200 + 299 = 499 > 300
    expect(decideRelease(200, 600, height)).toBe("dismiss");
  });

  it("returns when the finger was moving back up, even from low down", () => {
    expect(decideRelease(450, -400, height)).toBe("return");
  });
});
