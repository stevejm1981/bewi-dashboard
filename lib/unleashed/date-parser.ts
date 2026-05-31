/**
 * Parses Unleashed's .NET JSON date format: /Date(1707928417922)/ or /Date(1707928417922+0000)/
 *
 * Returns a JavaScript Date, or null when the value is null, empty, or unparseable.
 * Used in every place Unleashed dates are deserialised. Do not inline-parse.
 */

const DOT_NET_DATE_REGEX = /\/Date\((\d+)([+-]\d{4})?\)\//;

export function parseUnleashedDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const match = DOT_NET_DATE_REGEX.exec(value);
  if (!match) {
    // Maybe it is already an ISO string; try parsing directly
    const direct = new Date(value);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }

  const ms = Number.parseInt(match[1], 10);
  if (Number.isNaN(ms)) return null;

  return new Date(ms);
}

export function parseUnleashedDateOrNull(value: string | null | undefined): string | null {
  const d = parseUnleashedDate(value);
  return d ? d.toISOString() : null;
}
