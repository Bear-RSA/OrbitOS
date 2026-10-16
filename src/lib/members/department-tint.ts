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

export type DepartmentTint = "ocean" | "indigo" | "violet" | "rose" | "coral" | "amber" | "emerald" | "lime" | "slate";

export const DEPARTMENT_TINTS: Record<DepartmentTint, { label: string; rgb: string }> = {
  ocean: { label: "Ocean", rgb: "56 189 248" },
  indigo: { label: "Indigo", rgb: "129 140 248" },
  violet: { label: "Violet", rgb: "192 132 252" },
  rose: { label: "Rose", rgb: "251 113 133" },
  coral: { label: "Coral", rgb: "251 146 60" },
  amber: { label: "Amber", rgb: "250 204 21" },
  emerald: { label: "Emerald", rgb: "52 211 153" },
  lime: { label: "Lime", rgb: "163 230 53" },
  slate: { label: "Slate", rgb: "148 163 184" },
};

export const TINT_KEYS = Object.keys(DEPARTMENT_TINTS) as DepartmentTint[];

export function isDepartmentTint(value: unknown): value is DepartmentTint {
  return typeof value === "string" && value in DEPARTMENT_TINTS;
}

/** The saved tint, or one picked from the id for a department that has none. */
export function tintOf(department: { id: string; tint?: unknown }): DepartmentTint {
  if (isDepartmentTint(department.tint)) return department.tint;
  let hash = 0;
  for (const ch of department.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  // Slate is left for people who choose it.
  return TINT_KEYS[hash % (TINT_KEYS.length - 1)];
}
