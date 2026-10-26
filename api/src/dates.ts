const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface DayRange {
  date: string;
  start: Date;
  end: Date;
}

/**
 * Turns a ?date=YYYY-MM-DD query value into a UTC day range.
 * Missing means today (UTC). Returns null for anything malformed or for
 * dates that don't exist, like 2026-02-30.
 */
export function parseDay(value: unknown, now: Date = new Date()): DayRange | null {
  const date = value === undefined ? now.toISOString().slice(0, 10) : value;
  if (typeof date !== "string" || !DATE_RE.test(date)) return null;

  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== date) {
    return null;
  }

  return { date, start, end: new Date(start.getTime() + DAY_MS) };
}

/** ISO 8601 in UTC, without the ".000" when there are no milliseconds. */
export function toIsoUtc(date: Date): string {
  return date.toISOString().replace(".000Z", "Z");
}
