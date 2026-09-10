// All stay dates are represented as UTC midnight Date objects. API input/output uses
// ISO calendar strings (YYYY-MM-DD). Hijri conversion uses ICU's Umm al-Qura calendar,
// the civil calendar used in Saudi Arabia, so reports can be run in both calendars.

const DAY_MS = 86_400_000;

export function parseDay(input: string | Date): Date {
  if (input instanceof Date) return startOfDay(input);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (!m) throw new Error(`Invalid date: ${input}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, days: number): Date {
  return new Date(startOfDay(d).getTime() + days * DAY_MS);
}

export function formatDay(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/** Stay nights: every date from arrival (inclusive) to departure (exclusive). */
export function eachNight(arrival: Date, departure: Date): Date[] {
  const nights: Date[] = [];
  for (let d = startOfDay(arrival); d < startOfDay(departure); d = addDays(d, 1)) nights.push(d);
  return nights;
}

export function todayUtc(): Date {
  return startOfDay(new Date());
}

const hijriFormatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export interface HijriDate {
  year: number;
  month: number;
  day: number;
  formatted: string; // e.g. 1448-03-28
}

export function toHijri(d: Date): HijriDate {
  const parts = hijriFormatter.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return {
    year,
    month,
    day,
    formatted: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

export function dualCalendar(d: Date) {
  return { gregorian: formatDay(d), hijri: toHijri(d).formatted };
}
