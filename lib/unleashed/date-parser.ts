/**
 * Parses Unleashed's .NET JSON date format: /Date(1707928417922)/ or /Date(1707928417922+0000)/
 *
 * Returns a JavaScript Date, or null when the value is null, empty, or unparseable.
 * Used in every place Unleashed dates are deserialised. Do not inline-parse.
 *
 * IMPORTANT: Unleashed stores calendar dates (required date, order date...) as
 * midnight LOCAL time (Europe/London) and returns them as a UTC instant. During
 * British Summer Time, midnight on the 16th in London is 23:00 on the 15th in
 * UTC, so a plain toISOString() yields the wrong calendar day. The string
 * functions below therefore format in Europe/London, with the offset attached:
 *   - a `date` column reads the date part and gets the correct day
 *   - a `timestamptz` column resolves the offset and gets the correct instant
 */

const DOT_NET_DATE_REGEX = /\/Date\((\d+)([+-]\d{4})?\)\//;
const LONDON = 'Europe/London';

export function parseUnleashedDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const match = DOT_NET_DATE_REGEX.exec(value);
  if (!match) {
    const direct = new Date(value);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }

  const ms = Number.parseInt(match[1], 10);
  if (Number.isNaN(ms)) return null;

  return new Date(ms);
}

/** Calendar date in London, as YYYY-MM-DD. */
export function londonDateString(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LONDON, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** ISO-8601 string in London local time with its UTC offset, e.g. 2026-09-16T00:00:00.000+01:00 */
export function londonIsoString(d: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: LONDON,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZoneName: 'longOffset',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  // timeZoneName is "GMT+01:00" in BST, "GMT" in winter
  const raw = (parts.timeZoneName ?? 'GMT').replace('GMT', '');
  const offset = raw === '' ? '+00:00' : raw;
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const ms = String(d.getMilliseconds()).padStart(3, '0');

  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}.${ms}${offset}`;
}

/**
 * Unleashed date -> string for the database, or null.
 * Formatted in Europe/London with offset so date columns get the right calendar day.
 */
export function parseUnleashedDateOrNull(value: string | null | undefined): string | null {
  const d = parseUnleashedDate(value);
  return d ? londonIsoString(d) : null;
}

/** Unleashed date -> YYYY-MM-DD in London, or null. Use for date-only columns when explicit. */
export function parseUnleashedDateOnlyOrNull(value: string | null | undefined): string | null {
  const d = parseUnleashedDate(value);
  return d ? londonDateString(d) : null;
}
