/* ------------------------------------------------------------------ */
/*  Theme colours for JavaScript                                       */
/*                                                                     */
/*  Tailwind classes cover markup, but a fair amount of colour in this */
/*  app is passed as a prop — meter fills, loader strokes, chart bars, */
/*  status accents. Those bypassed the class layer entirely and were   */
/*  hardcoded hex, which is exactly what pins a UI to one theme.       */
/*                                                                     */
/*  These resolve through the same CSS variables as the classes, so a  */
/*  theme switch moves them too. They are valid anywhere CSS is        */
/*  computed — inline `style`, CSS-in-JS — but NOT in SVG presentation */
/*  attributes, which do not resolve `var()`. Set those via `style`.   */
/* ------------------------------------------------------------------ */

export const themeColor = {
  ink: "rgb(var(--ink))",
  inkMuted: "rgb(var(--ink-muted))",
  inkDim: "rgb(var(--ink-dim))",
  inkFaint: "rgb(var(--ink-faint))",
  /** For marks drawn on top of a solid ink fill. */
  onInk: "rgb(var(--on-ink))",

  green: "rgb(var(--orbit-green))",
  amber: "rgb(var(--orbit-amber))",
  red: "rgb(var(--orbit-red))",
  blue: "rgb(var(--orbit-blue))",
  violet: "rgb(var(--orbit-violet))",
  teal: "rgb(var(--orbit-teal))",
  gold: "rgb(var(--orbit-gold))",
  pink: "rgb(var(--orbit-pink))",
} as const;

export type ThemeColor = (typeof themeColor)[keyof typeof themeColor];
