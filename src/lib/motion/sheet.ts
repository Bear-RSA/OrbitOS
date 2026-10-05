import { project } from "./spring";

/* ------------------------------------------------------------------ */
/*  Where a released sheet should go                                   */
/*                                                                     */
/*  Pure so it can be tested without a DOM. Offsets are px from the    */
/*  open position; `height` is the sheet's own height, which is also   */
/*  the fully-dismissed offset.                                        */
/* ------------------------------------------------------------------ */

/** A flick this fast dismisses regardless of where the finger was. */
export const FLICK_VELOCITY = 1200;

/** Any deliberate upward motion at release keeps the sheet. */
const RETURNING_VELOCITY = -200;

export function decideRelease(offset: number, velocity: number, height: number): "dismiss" | "return" {
  if (velocity > FLICK_VELOCITY) return "dismiss";
  if (velocity < RETURNING_VELOCITY) return "return";
  // Decide from where the throw would come to rest, not where it let go.
  const projected = offset + project(velocity);
  return projected > height * 0.5 ? "dismiss" : "return";
}
