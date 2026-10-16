/* ------------------------------------------------------------------ */
/*  A department's description and icon                                */
/*                                                                     */
/*  Both are set by Internal Management when a department is made or   */
/*  edited, and shown on its card. The icon is the kebab-case name of  */
/*  any Lucide icon ("rocket", "hard-hat"); the card loads just that    */
/*  one. An unknown name draws the default mark, so a name Lucide      */
/*  later drops never breaks a card.                                   */
/*                                                                     */
/*  Pure, so the server checks what the dialog sends.                  */
/* ------------------------------------------------------------------ */

export const MAX_DEPARTMENT_DESCRIPTION = 140;
export const DEFAULT_DEPARTMENT_ICON = "network";

/** Trimmed and capped, or null when blank. */
export function normaliseDepartmentDescription(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_DEPARTMENT_DESCRIPTION);
  return text || null;
}

/** Shaped like a Lucide icon name. Whether Lucide has it is the card's business. */
export function isIconName(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value.length <= 64;
}
