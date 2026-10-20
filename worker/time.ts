// Tracking-day math. A "tracking day" starts at DAY_ROLLOVER_HOUR (default 3 AM)
// local time, so a 1 AM snack counts toward the day that just ended.

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
}

export function localParts(instant: Date, tz: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24, // some runtimes emit "24" at midnight
    minute: Number(map.minute),
  };
}

function ymd(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** 'YYYY-MM-DD' tracking date for an instant. */
export function trackingDate(instant: Date, tz: string, rolloverHour: number): string {
  const p = localParts(instant, tz);
  let epochDay = Date.UTC(p.year, p.month - 1, p.day);
  if (p.hour < rolloverHour) epochDay -= 86_400_000;
  const d = new Date(epochDay);
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function todayTrackingDate(tz: string, rolloverHour: number): string {
  return trackingDate(new Date(), tz, rolloverHour);
}

/** Hours until the next rollover boundary (how much of the tracking day is left). */
export function hoursLeftInDay(instant: Date, tz: string, rolloverHour: number): number {
  const p = localParts(instant, tz);
  const nowH = p.hour + p.minute / 60;
  let left = rolloverHour - nowH;
  if (left <= 0) left += 24;
  return Math.round(left * 10) / 10;
}

/** Inclusive list of 'YYYY-MM-DD' from `start` up to and including `end`. */
export function dateRange(startISODate: string, endISODate: string): string[] {
  const out: string[] = [];
  let t = Date.parse(`${startISODate}T00:00:00Z`);
  const end = Date.parse(`${endISODate}T00:00:00Z`);
  while (t <= end) {
    const d = new Date(t);
    out.push(ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
    t += 86_400_000;
  }
  return out;
}

export function addDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000;
  const d = new Date(t);
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function daysBetween(aISODate: string, bISODate: string): number {
  return Math.round(
    (Date.parse(`${bISODate}T00:00:00Z`) - Date.parse(`${aISODate}T00:00:00Z`)) / 86_400_000,
  );
}
