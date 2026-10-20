// Client-side tracking-day helpers. The server is authoritative; these just keep
// the UI's notion of "today" aligned with the 3 AM rollover on the device clock.

const ROLLOVER_HOUR = 3;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function todayISO(now = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < ROLLOVER_HOUR) d.setDate(d.getDate() - 1);
  return ymd(d);
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function nowLocalISO(): string {
  // 'YYYY-MM-DDTHH:mm' in local time, for datetime-local inputs
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}

export function localInputToISO(v: string): string {
  return new Date(v).toISOString();
}
