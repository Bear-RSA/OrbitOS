"use client";

import { useId } from "react";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Orbit loader                                                       */
/*                                                                     */
/*  The full-screen wait between pages: the orbit mark, still, with    */
/*  its satellite flying the band. The planet and the band never move; */
/*  only the satellite says "working".                                 */
/*                                                                     */
/*  The band is a tilted circle seen at an angle, so the satellite     */
/*  runs it the way a real orbit reads: quick across the face, slow    */
/*  at the two ends where it turns towards or away from you, a touch   */
/*  bigger in front and smaller behind. On the far half it passes      */
/*  behind the planet — a mask cuts the planet's disc out of it, and   */
/*  the mask only switches on at the band's ends, outside the disc,    */
/*  so the switch never shows.                                         */
/*                                                                     */
/*  The satellite is a bead of liquid glass: amber body, a hot         */
/*  specular point up and to the left, and a thin bright rim.          */
/*                                                                     */
/*  Small spinners inside buttons stay `ui/loader`; this is for a      */
/*  screen with nothing else on it.                                    */
/* ------------------------------------------------------------------ */

/** One lap. */
const DURATION = "2.4s";

/* The band, matching orbit-mark: an ellipse at (50, 49), tilted -41°. */
const RX = 48;
const RY = 12.5;
/** Planet disc the satellite hides behind: outer ring plus half its stroke. */
const PLANET_R = 34 + 1.8;
const SAT_R = 5.2;

/** Starts at the band's upper-right end and sweeps the near (lower) half first. */
const BAND_PATH = `M${RX},0 A${RX},${RY} 0 1,1 ${-RX},0 A${RX},${RY} 0 1,1 ${RX},0`;

/*
 * `animateMotion` paces by distance along the path. An orbit seen at an
 * angle is paced by angle instead, so map even steps of angle to the share
 * of path length covered by then. Twelve degrees a step is smooth enough
 * that the linear segments between keys don't show.
 */
const STEPS = 30;
const MOTION = (() => {
  const lengths = [0];
  for (let i = 1; i <= STEPS; i++) {
    const a0 = ((i - 1) / STEPS) * Math.PI * 2;
    const a1 = (i / STEPS) * Math.PI * 2;
    // Simpson's rule on the ellipse's speed |(−rx sin t, ry cos t)|.
    const speed = (t: number) => Math.hypot(RX * Math.sin(t), RY * Math.cos(t));
    const seg = ((a1 - a0) / 6) * (speed(a0) + 4 * speed((a0 + a1) / 2) + speed(a1));
    lengths.push(lengths[i - 1] + seg);
  }
  const total = lengths[STEPS];
  const times: string[] = [];
  const points: string[] = [];
  const radii: string[] = [];
  const opacity: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const depth = Math.sin((i / STEPS) * Math.PI * 2); // 1 nearest, -1 farthest
    times.push((i / STEPS).toFixed(4));
    points.push((lengths[i] / total).toFixed(4));
    radii.push((SAT_R * (0.86 + 0.18 * depth)).toFixed(2));
    opacity.push((0.84 + 0.16 * depth).toFixed(2));
  }
  return {
    keyTimes: times.join(";"),
    keyPoints: points.join(";"),
    radii: radii.join(";"),
    opacity: opacity.join(";"),
  };
})();

function GlassBead({ id, animated }: { id: string; animated: boolean }) {
  const r = animated ? (
    <animate attributeName="r" dur={DURATION} repeatCount="indefinite" keyTimes={MOTION.keyTimes} values={MOTION.radii} />
  ) : null;
  return (
    <>
      <circle r={SAT_R} fill={`url(#${id}-body)`}>
        {r}
      </circle>
      <circle r={SAT_R} fill={`url(#${id}-shine)`}>
        {r}
      </circle>
      <circle r={SAT_R} fill="none" stroke="rgb(255 255 255 / 0.55)" strokeWidth={0.6}>
        {r}
      </circle>
    </>
  );
}

export function OrbitLoader({ size = 80, className }: { size?: number; className?: string }) {
  const id = `orbit-loader-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="-4 -4 108 108" fill="none" aria-hidden className="h-[72%] w-[72%] overflow-visible text-ink-strong">
        <defs>
          {/* Body: amber glass, clear-ish in the middle, deeper at the edge. */}
          <radialGradient id={`${id}-body`} cx="50%" cy="50%" r="50%" fx="38%" fy="34%">
            <stop offset="0%" stopColor="rgb(var(--orbit-amber))" stopOpacity={0.55} />
            <stop offset="70%" stopColor="rgb(var(--orbit-amber))" stopOpacity={0.9} />
            <stop offset="100%" stopColor="rgb(var(--orbit-amber))" stopOpacity={1} />
          </radialGradient>
          {/* Specular point, plus a faint caustic catching the lower right. */}
          <radialGradient id={`${id}-shine`} cx="34%" cy="30%" r="38%">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.95} />
            <stop offset="45%" stopColor="#fff" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#fff" stopOpacity={0} />
          </radialGradient>
          {/* Everything but the planet's disc; the disc only blocks on the far half. */}
          <mask id={`${id}-behind`} maskUnits="userSpaceOnUse" x="-4" y="-4" width="108" height="108">
            <rect x="-4" y="-4" width="108" height="108" fill="#fff" />
            <circle cx="50" cy="50" r={PLANET_R} fill="#000" opacity={0}>
              <animate
                attributeName="opacity"
                dur={DURATION}
                repeatCount="indefinite"
                calcMode="discrete"
                keyTimes="0;0.5"
                values="0;1"
              />
            </circle>
          </mask>
        </defs>

        {/* The mark, without its satellite. Same geometry as orbit-mark. */}
        <g stroke="currentColor" strokeWidth={3.6} strokeLinecap="round">
          <circle cx="50" cy="50" r="34" />
          <circle cx="50" cy="50" r="23.5" />
          <ellipse cx="50" cy="49" rx={RX} ry={RY} transform="rotate(-41 50 49)" />
        </g>

        {/* The satellite in flight. SMIL ignores reduced motion, so the
            whole flight is hidden then and the parked bead below shows. */}
        <g mask={`url(#${id}-behind)`} className="motion-reduce:hidden">
          <g transform="translate(50 49) rotate(-41)">
            <g style={{ filter: "drop-shadow(0 0 2px rgb(var(--orbit-amber) / 0.55))" }}>
              <animateMotion
                dur={DURATION}
                repeatCount="indefinite"
                path={BAND_PATH}
                calcMode="linear"
                keyTimes={MOTION.keyTimes}
                keyPoints={MOTION.keyPoints}
              />
              <animate
                attributeName="opacity"
                dur={DURATION}
                repeatCount="indefinite"
                keyTimes={MOTION.keyTimes}
                values={MOTION.opacity}
              />
              <GlassBead id={id} animated />
            </g>
          </g>
        </g>

        {/* Reduced motion: parked where the logo keeps it, breathing. */}
        <g
          transform="translate(74.5 25.5)"
          className="hidden motion-reduce:block motion-reduce:animate-pulse"
          style={{ filter: "drop-shadow(0 0 2px rgb(var(--orbit-amber) / 0.55))" }}
        >
          <GlassBead id={id} animated={false} />
        </g>
      </svg>
    </div>
  );
}
