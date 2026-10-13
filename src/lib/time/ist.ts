/**
 * India Standard Time helpers.
 *
 * Vercel functions run in UTC, so every "today", "midnight" and user-entered
 * wall-clock time must be converted explicitly. IST has no DST, so a fixed
 * +05:30 offset is exact.
 */

export const APP_TIME_ZONE = "Asia/Kolkata";

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** UTC instant of 00:00 IST on the IST calendar day containing `date`. */
export function istStartOfDay(date: Date = new Date()): Date {
  const shifted = date.getTime() + IST_OFFSET_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - IST_OFFSET_MS);
}

/** [start, end) of the IST day containing `date`. */
export function istDayRange(date: Date = new Date()): { start: Date; end: Date } {
  const start = istStartOfDay(date);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** "YYYY-MM-DD" of the IST calendar day containing `date`. */
export function istDateString(date: Date = new Date()): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Strictly parses a "YYYY-MM-DD" string. Returns null for anything else. */
export function parseDateParam(value?: string | null): string | null {
  if (!value) return null;
  const m = DATE_RE.exec(value.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    return null;
  }
  return value.trim();
}

/** UTC instant of 00:00 IST on the given "YYYY-MM-DD" date. */
export function istDateToInstant(dateStr: string): Date {
  const m = DATE_RE.exec(dateStr)!;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - IST_OFFSET_MS);
}

/** [start, end) of an IST calendar day given as "YYYY-MM-DD" (falls back to today). */
export function istDayRangeFromParam(value?: string | null): { start: Date; end: Date; dateStr: string } {
  const dateStr = parseDateParam(value) ?? istDateString();
  const start = istDateToInstant(dateStr);
  return { start, end: new Date(start.getTime() + DAY_MS), dateStr };
}

/** Combines an IST date ("YYYY-MM-DD") and an IST wall-clock time ("HH:mm") into a UTC instant. */
export function istDateTime(dateStr: string, time: string): Date | null {
  if (!parseDateParam(dateStr)) return null;
  const t = TIME_RE.exec(time.trim());
  if (!t) return null;
  return new Date(istDateToInstant(dateStr).getTime() + (+t[1] * 60 + +t[2]) * 60 * 1000);
}

export function isValidTime(time: string): boolean {
  return TIME_RE.test(time.trim());
}

/** Parses a positive integer page number from a query param; defaults to 1. */
export function parsePageParam(value?: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}
