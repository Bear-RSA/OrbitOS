import { OrbitMark } from "@/components/brand/orbit-mark";
import { cn } from "@/lib/utils/classnames";

/* ------------------------------------------------------------------ */
/*  Orbit loader                                                       */
/*                                                                     */
/*  The full-screen wait between pages: the orbit mark, still, with a  */
/*  beam sweeping round it. The mark holding still is the point — the  */
/*  brand is what you look at, and only the beam says "working".       */
/*                                                                     */
/*  The beam is a conic gradient cut to a ring by a radial mask, so    */
/*  its tail fades out along the arc rather than ending in a hard cap. */
/*  It is one element turning on `transform`, which the compositor     */
/*  runs without touching layout while the next page is being built.   */
/*                                                                     */
/*  Small spinners inside buttons stay `ui/loader`; this is for a      */
/*  screen with nothing else on it.                                    */
/* ------------------------------------------------------------------ */

/** Cuts a filled disc down to a 3px ring at its edge. */
const RING_MASK = "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px))";

export function OrbitLoader({ size = 80, className }: { size?: number; className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {/* The track: where the beam runs, faintly, so the ring reads as a
          ring even at the moment the beam's tail is shortest. */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full bg-line/[0.08]"
        style={{ WebkitMask: RING_MASK, mask: RING_MASK }}
      />

      {/* The beam. With reduced motion it stops sweeping and breathes in
          place instead, so the screen still reads as busy. */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full motion-safe:animate-spin motion-safe:[animation-duration:1.4s] motion-reduce:animate-pulse"
        style={{
          background: "conic-gradient(from 0deg, transparent 0deg, rgb(var(--ink) / 0) 140deg, rgb(var(--ink) / 0.95) 360deg)",
          WebkitMask: RING_MASK,
          mask: RING_MASK,
          filter: "drop-shadow(0 0 4px rgb(var(--ink) / 0.35))",
        }}
      />

      <OrbitMark className="h-[58%] w-[58%] text-ink-strong" />
    </div>
  );
}
