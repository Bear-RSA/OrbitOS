/* ------------------------------------------------------------------ */
/*  Springs, in Apple's two parameters                                 */
/*                                                                     */
/*  A stiffness/damping/mass triplet is hard to reason about; Apple    */
/*  replaced it with two numbers a designer can feel:                  */
/*                                                                     */
/*    response      seconds — how quickly the value reaches the target */
/*    dampingRatio  1.0 settles with no overshoot; < 1 bounces         */
/*                                                                     */
/*  Everything here is pure arithmetic so it can be unit-tested and    */
/*  shared between the CSS easing generator and the runtime spring.    */
/* ------------------------------------------------------------------ */

export interface SpringConfig {
  /** Seconds to approach the target. Lower is snappier. */
  response: number;
  /** 1 = critically damped (no overshoot). ~0.8 = a little bounce. */
  dampingRatio: number;
}

/** House defaults. Bounce is reserved for things the user threw. */
export const SPRING = {
  /** Reposition, reveal, settle — anything that did not carry momentum. */
  default: { response: 0.4, dampingRatio: 1 },
  /** Menus and popovers: quicker, still no overshoot. */
  quick: { response: 0.3, dampingRatio: 1 },
  /** Sheets, drawers, flicked cards — the gesture brought its own energy. */
  momentum: { response: 0.35, dampingRatio: 0.8 },
} as const satisfies Record<string, SpringConfig>;

/** Angular frequency of the undamped spring: `response` is one period. */
export function angularFrequency(response: number): number {
  return (2 * Math.PI) / response;
}

/**
 * Position of a unit spring at time `t`, released from rest at 0 and
 * pulled to 1. Closed form, so the CSS easing can sample it exactly.
 */
export function springPosition(t: number, cfg: SpringConfig): number {
  const w = angularFrequency(cfg.response);
  const z = cfg.dampingRatio;
  if (t <= 0) return 0;

  if (z >= 1) {
    // Critically damped: x = 1 - (1 + wt) e^{-wt}
    return 1 - (1 + w * t) * Math.exp(-w * t);
  }
  // Under-damped: x = 1 - e^{-zwt} (cos(wd t) + (zw / wd) sin(wd t))
  const wd = w * Math.sqrt(1 - z * z);
  const decay = Math.exp(-z * w * t);
  return 1 - decay * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}

/**
 * Seconds until the spring is within `epsilon` of its target for good.
 * A spring has no duration; this is the closest thing to one, used to size
 * the fixed-length CSS approximation.
 */
export function settleTime(cfg: SpringConfig, epsilon = 0.01): number {
  const w = angularFrequency(cfg.response);
  const z = Math.min(cfg.dampingRatio, 1);
  if (z >= 1) {
    // Solve (1 + wt) e^{-wt} = eps numerically — no closed form.
    let lo = 0;
    let hi = cfg.response * 4;
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      const rem = (1 + w * mid) * Math.exp(-w * mid);
      if (rem > epsilon) lo = mid;
      else hi = mid;
    }
    return hi;
  }
  // The oscillation's amplitude is the envelope e^{-zwt} scaled by
  // 1/sqrt(1 - z^2), so solve for the scaled envelope reaching eps.
  return -Math.log(epsilon * Math.sqrt(1 - z * z)) / (z * w);
}

/**
 * A CSS `linear()` easing that traces the spring. CSS transitions have a
 * fixed duration, so pair the string with `settleTime(cfg)` as the duration
 * and the curve lands exactly on the target at the end.
 */
export function springEasing(cfg: SpringConfig, samples = 48): string {
  const total = settleTime(cfg);
  const points: string[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = (i / samples) * total;
    const x = i === samples ? 1 : springPosition(t, cfg);
    points.push(Number(x.toFixed(4)).toString());
  }
  return `linear(${points.join(", ")})`;
}

/** One integration step of a damped spring. Semi-implicit Euler — stable
 *  at the step sizes a display refresh hands us, and it never overshoots
 *  the analytic solution at ζ = 1. */
export function stepSpring(
  position: number,
  velocity: number,
  target: number,
  cfg: SpringConfig,
  dtSeconds: number
): { position: number; velocity: number } {
  const w = angularFrequency(cfg.response);
  const stiffness = w * w;
  const damping = 2 * cfg.dampingRatio * w;
  const accel = -stiffness * (position - target) - damping * velocity;
  const v = velocity + accel * dtSeconds;
  return { position: position + v * dtSeconds, velocity: v };
}

/**
 * Where a flick would come to rest on its own. This is UIScrollView's
 * deceleration, not the v²/2a of a physics textbook — Apple ships the
 * exponential form and it is what a thrown card is expected to feel like.
 *
 * @param velocity   px/s at release
 * @param decelerationRate  0.998 scrolls like iOS; 0.99 stops sooner
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * Resistance past a boundary. The further past it the pointer goes, the
 * less the element follows, and it never quite stops — a hard stop reads
 * as "frozen", progressive resistance reads as "nothing more here".
 *
 * @param overshoot  px beyond the boundary (sign preserved)
 * @param dimension  px of the thing being dragged, sets the scale of the curve
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
