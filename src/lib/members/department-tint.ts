/* ------------------------------------------------------------------ */
/*  Department tints                                                   */
/*                                                                     */
/*  Each department has a colour, picked by Internal Management when   */
/*  it is made or edited, and saved as `departments/{id}.tint`. Cards  */
/*  are glass, so the colour shows as a tint inside them rather than   */
/*  a halo around them: halos already mean rank.                       */
/*                                                                     */
/*  A department saved before tints existed gets one from its id, the  */
/*  same every time, so no card is left grey while nobody has picked.  */
/*                                                                     */
/*  Values are "r g b" for `rgb(var(--tint) / a)`. Pure, so the server */
/*  checks the same list the picker shows.                             */
/* ------------------------------------------------------------------ */

/** Every colour on offer, in the order the picker shows them: round the wheel, then neutrals. */
export const DEPARTMENT_TINTS = {
  crimson: { label: "Crimson", rgb: "239 68 68" },
  rose: { label: "Rose", rgb: "251 113 133" },
  pink: { label: "Pink", rgb: "244 114 182" },
  magenta: { label: "Magenta", rgb: "232 121 249" },
  violet: { label: "Violet", rgb: "192 132 252" },
  purple: { label: "Purple", rgb: "147 112 245" },
  indigo: { label: "Indigo", rgb: "129 140 248" },
  royal: { label: "Royal blue", rgb: "79 128 255" },
  ocean: { label: "Ocean", rgb: "56 189 248" },
  cyan: { label: "Cyan", rgb: "34 211 238" },
  teal: { label: "Teal", rgb: "45 212 191" },
  emerald: { label: "Emerald", rgb: "52 211 153" },
  forest: { label: "Forest", rgb: "74 160 96" },
  lime: { label: "Lime", rgb: "163 230 53" },
  amber: { label: "Amber", rgb: "250 204 21" },
  gold: { label: "Gold", rgb: "234 179 8" },
  coral: { label: "Coral", rgb: "251 146 60" },
  terracotta: { label: "Terracotta", rgb: "214 110 72" },
  bronze: { label: "Bronze", rgb: "180 131 82" },
  sand: { label: "Sand", rgb: "214 190 150" },
  slate: { label: "Slate", rgb: "148 163 184" },
  graphite: { label: "Graphite", rgb: "120 120 130" },
} satisfies Record<string, { label: string; rgb: string }>;

export type DepartmentTint = keyof typeof DEPARTMENT_TINTS;

export const TINT_KEYS = Object.keys(DEPARTMENT_TINTS) as DepartmentTint[];

export function isDepartmentTint(value: unknown): value is DepartmentTint {
  return typeof value === "string" && value in DEPARTMENT_TINTS;
}

/**
 * The colours an unpicked department falls back to. Kept to the first eight
 * that ever shipped, in their original order, so adding colours to the
 * picker never changes the colour an existing department already shows.
 */
const FALLBACK_TINTS: readonly DepartmentTint[] = ["ocean", "indigo", "violet", "rose", "coral", "amber", "emerald", "lime"];

/** The saved tint, or one picked from the id for a department that has none. */
export function tintOf(department: { id: string; tint?: unknown }): DepartmentTint {
  if (isDepartmentTint(department.tint)) return department.tint;
  let hash = 0;
  for (const ch of department.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_TINTS[hash % FALLBACK_TINTS.length];
}