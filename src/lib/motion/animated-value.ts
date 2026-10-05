import { SPRING, type SpringConfig, stepSpring } from "./spring";

/* ------------------------------------------------------------------ */
/*  A value that can be dragged, thrown, and retargeted mid-flight     */
/*                                                                     */
/*  CSS transitions cannot be grabbed: a sheet that is halfway closed  */
/*  has to finish closing before a second touch can reopen it. This    */
/*  keeps the live position and velocity itself, so a new target or a  */
/*  new finger always starts from wherever the element actually is,    */
/*  moving however fast it actually was. No React state: the value is  */
/*  written straight to the DOM on every frame.                        */
/* ------------------------------------------------------------------ */

type Listener = (value: number) => void;

/** Below this the spring is at rest and the frame loop stops. */
const REST_DISTANCE = 0.05;
const REST_VELOCITY = 0.5;

/** rAF can stall (tab hidden, long task); clamp so the spring stays stable. */
const MAX_FRAME_SECONDS = 1 / 30;

export class AnimatedValue {
  private value: number;
  private velocity = 0;
  private target: number;
  private config: SpringConfig = SPRING.default;
  private frame: number | null = null;
  private last = 0;
  private listeners = new Set<Listener>();
  private onRest: (() => void) | null = null;

  constructor(initial = 0) {
    this.value = initial;
    this.target = initial;
  }

  get(): number {
    return this.value;
  }

  getVelocity(): number {
    return this.velocity;
  }

  isAnimating(): boolean {
    return this.frame !== null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Direct manipulation: the finger owns the value. Stops any spring. */
  set(value: number): void {
    this.stop();
    this.velocity = 0;
    this.write(value);
  }

  /**
   * Spring to `target` from the current position. Pass the release
   * velocity so the animation continues at the finger's speed instead of
   * starting from a standstill — that seam is what separates fluid from
   * fine. Retargeting a running spring keeps its velocity.
   */
  animateTo(
    target: number,
    options: { config?: SpringConfig; velocity?: number; onRest?: () => void } = {}
  ): void {
    this.target = target;
    this.config = options.config ?? SPRING.default;
    if (options.velocity !== undefined) this.velocity = options.velocity;
    this.onRest = options.onRest ?? null;
    if (this.frame === null) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  stop(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.onRest = null;
  }

  destroy(): void {
    this.stop();
    this.listeners.clear();
  }

  private tick = (now: number): void => {
    const dt = Math.min((now - this.last) / 1000, MAX_FRAME_SECONDS);
    this.last = now;

    const next = stepSpring(this.value, this.velocity, this.target, this.config, dt);
    this.velocity = next.velocity;

    const atRest =
      Math.abs(next.position - this.target) < REST_DISTANCE &&
      Math.abs(this.velocity) < REST_VELOCITY;

    if (atRest) {
      this.frame = null;
      this.velocity = 0;
      this.write(this.target);
      const done = this.onRest;
      this.onRest = null;
      done?.();
      return;
    }

    this.write(next.position);
    this.frame = requestAnimationFrame(this.tick);
  };

  private write(value: number): void {
    this.value = value;
    this.listeners.forEach((listener) => listener(value));
  }
}

/* ------------------------------------------------------------------ */
/*  Release velocity from a short pointer history                      */
/*                                                                     */
/*  The last event alone is noisy; the whole gesture is stale. A short */
/*  window of recent samples gives the speed the finger actually had   */
/*  when it let go.                                                    */
/* ------------------------------------------------------------------ */

export interface Sample {
  value: number;
  time: number;
}

const VELOCITY_WINDOW_MS = 100;

export class VelocityTracker {
  private samples: Sample[] = [];

  reset(): void {
    this.samples = [];
  }

  push(value: number, time: number): void {
    this.samples.push({ value, time });
    const cutoff = time - VELOCITY_WINDOW_MS;
    while (this.samples.length > 2 && this.samples[0].time < cutoff) {
      this.samples.shift();
    }
  }

  /** px per second over the recent window; 0 if the finger paused. */
  velocity(now: number): number {
    if (this.samples.length < 2) return 0;
    const newest = this.samples[this.samples.length - 1];
    // A finger that stopped and then lifted has no momentum to hand off.
    if (now - newest.time > 60) return 0;
    const oldest = this.samples[0];
    const dt = newest.time - oldest.time;
    if (dt <= 0) return 0;
    return ((newest.value - oldest.value) / dt) * 1000;
  }
}
