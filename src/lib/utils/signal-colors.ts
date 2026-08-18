/* ------------------------------------------------------------------ */
/*  Signal Colours                                                     */
/*                                                                     */
/*  Resolved values of the `orbit-*` and `ink` Tailwind tokens, for the */
/*  handful of places that apply colour through an inline style and so  */
/*  cannot use a class — activity-feed event types and file-type        */
/*  badges. Keeping them here means the palette has one definition      */
/*  instead of drifting back into per-file hexes.                       */
/*                                                                     */
/*  If a token changes in tailwind.config.ts, change it here too.       */
/* ------------------------------------------------------------------ */

export const SIGNAL = {
  green: "hsl(142, 69%, 45%)", // orbit-green
  red: "hsl(0, 78%, 62%)", // orbit-red
  amber: "hsl(38, 92%, 55%)", // orbit-amber
  blue: "hsl(213, 92%, 65%)", // orbit-blue
  ink: "#EDEDED", // ink
  muted: "#A1A1A1", // ink.muted
} as const;
