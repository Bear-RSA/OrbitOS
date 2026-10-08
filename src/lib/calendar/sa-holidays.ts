/* ------------------------------------------------------------------ */
/*  South African public holidays                                      */
/*                                                                     */
/*  Computed rather than listed, so the calendar never runs out of     */
/*  years. The rules come from the Public Holidays Act 36 of 1994:     */
/*  ten fixed dates, Good Friday and Family Day off Western Easter,    */
/*  and a holiday that falls on a Sunday moves to the Monday after.    */
/*                                                                     */
/*  One-off days the President declares (election days, mostly)        */
/*  cannot be computed. They go in `DECLARED` by hand.                 */
/*                                                                     */
/*  Cosmetic only. Nothing here blocks booking or feeds availability.  */
/* ------------------------------------------------------------------ */

const FIXED: Array<[month: number, day: number, name: string]> = [
  [1, 1, "New Year's Day"],
  [3, 21, "Human Rights Day"],
  [4, 27, "Freedom Day"],
  [5, 1, "Workers' Day"],
  [6, 16, "Youth Day"],
  [8, 9, "National Women's Day"],
  [9, 24, "Heritage Day"],
  [12, 16, "Day of Reconciliation"],
  [12, 25, "Christmas Day"],
  [12, 26, "Day of Goodwill"],
];

/** Declared one-off holidays, keyed "YYYY-MM-DD". */
const DECLARED: Record<string, string> = {
  "2024-05-29": "General Election Day",
};

function key(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** UTC date arithmetic, so no local timezone can shift a day. */
function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function keyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Western (Gregorian) Easter Sunday — the anonymous Gregorian algorithm. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

const cache = new Map<number, Map<string, string>>();

/** Every public holiday in `year`, date key → name. */
export function saPublicHolidays(year: number): Map<string, string> {
  const hit = cache.get(year);
  if (hit) return hit;

  const out = new Map<string, string>();

  for (const [m, d, name] of FIXED) out.set(key(year, m, d), name);

  const easter = easterSunday(year).getTime();
  out.set(keyOf(new Date(easter - 2 * 86_400_000)), "Good Friday");
  out.set(keyOf(new Date(easter + 1 * 86_400_000)), "Family Day");

  /* Sunday rule. When the Monday is already a holiday (Christmas on a
     Sunday puts it on the Day of Goodwill), the observed day rolls on
     to the next free day. */
  for (const [m, d, name] of FIXED) {
    const date = utc(year, m, d);
    if (date.getUTCDay() !== 0) continue;
    let observed = new Date(date.getTime() + 86_400_000);
    while (out.has(keyOf(observed))) {
      observed = new Date(observed.getTime() + 86_400_000);
    }
    out.set(keyOf(observed), `${name} (observed)`);
  }

  for (const [k, name] of Object.entries(DECLARED)) {
    if (k.startsWith(`${year}-`)) out.set(k, name);
  }

  cache.set(year, out);
  return out;
}

/** The holiday on a "YYYY-MM-DD" key, or null. */
export function saHolidayName(dateKey: string): string | null {
  const year = Number(dateKey.slice(0, 4));
  return saPublicHolidays(year).get(dateKey) ?? null;
}
