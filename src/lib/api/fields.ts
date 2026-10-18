/* ------------------------------------------------------------------ */
/*  Request field readers                                              */
/*                                                                     */
/*  The API's callers are programs, often a language model filling in */
/*  arguments, so a wrong type is common and must come back as a       */
/*  sentence the model can act on rather than a 500.                   */
/* ------------------------------------------------------------------ */

export class FieldError extends Error {}

export function optionalString(body: Record<string, unknown>, key: string, max = 10_000): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new FieldError(`"${key}" must be a string.`);
  if (value.length > max) throw new FieldError(`"${key}" is limited to ${max} characters.`);
  return value;
}

export function optionalNullableString(body: Record<string, unknown>, key: string): string | null | undefined {
  if (body[key] === null) return null;
  return optionalString(body, key, 100);
}

export function optionalStringArray(body: Record<string, unknown>, key: string, max = 20): string[] | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new FieldError(`"${key}" must be an array of member ids.`);
  }
  if (value.length > max) throw new FieldError(`"${key}" is limited to ${max} entries.`);
  return value as string[];
}

export function optionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new FieldError(`"${key}" must be true or false.`);
  return value;
}

/** A "YYYY-MM-DD" day, or null to clear it. */
export function optionalDateKey(body: Record<string, unknown>, key: string): string | null | undefined {
  const value = optionalNullableString(body, key);
  if (value === undefined || value === null) return value;
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) throw new FieldError(`"${key}" must be a date like 2026-10-31.`);
  return value;
}
