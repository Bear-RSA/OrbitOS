import { cn } from "@/lib/utils/classnames";

/** The orbit mark as a line drawing, so it stays crisp at any size and the
 *  satellite can carry the Signal accent. Geometry traced from public/logo.png. */
export function OrbitMark({
  className,
  signal = true,
}: {
  className?: string;
  /** Paint the satellite in Signal amber. Off for ink-only contexts. */
  signal?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden
      className={cn("h-6 w-6 text-ink", className)}
    >
      <g stroke="currentColor" strokeWidth={3.6} strokeLinecap="round">
        <circle cx="50" cy="50" r="34" />
        <circle cx="50" cy="50" r="23.5" />
        <ellipse cx="50" cy="49" rx="48" ry="12.5" transform="rotate(-41 50 49)" />
      </g>
      <circle
        cx="74.5"
        cy="25.5"
        r="5.2"
        className={signal ? "fill-orbit-amber" : "fill-current"}
      />
    </svg>
  );
}
