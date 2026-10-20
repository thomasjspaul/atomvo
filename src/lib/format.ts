export const LB_PER_KG = 2.2046226218;
export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const lbToKg = (lb: number) => lb / LB_PER_KG;

export const cmToFtIn = (cm: number) => {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn - ft * 12);
  return inch === 12 ? { ft: ft + 1, in: 0 } : { ft, in: inch };
};
export const ftInToCm = (ft: number, inch: number) => (ft * 12 + inch) * 2.54;

export const round = (n: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export const kcal = (n: number) => `${Math.round(n)}`;
export const grams = (n: number) => `${Math.round(n)}g`;

export function displayWeight(kg: number, units: "imperial" | "metric"): string {
  return units === "imperial" ? `${round(kgToLb(kg), 1)} lb` : `${round(kg, 1)} kg`;
}

export function relativeDay(isoDate: string, todayISO: string): string {
  if (isoDate === todayISO) return "Today";
  const a = Date.parse(`${isoDate}T00:00:00Z`);
  const b = Date.parse(`${todayISO}T00:00:00Z`);
  const diff = Math.round((b - a) / 86_400_000);
  if (diff === 1) return "Yesterday";
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  return new Date(a).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "3:42 PM" if today, else "Aug 29, 3:42 PM". */
export function syncedAt(iso: string): string {
  const d = new Date(iso);
  const t = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay = d.toDateString() === new Date().toDateString();
  if (sameDay) return t;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${t}`;
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.max(0, Math.min(1.5, part / whole));
}

export const ML_PER_OZ = 29.5735;
export const mlToOz = (ml: number) => ml / ML_PER_OZ;
export const ozToMl = (oz: number) => oz * ML_PER_OZ;

/** Water volume in the user's units: "72 oz" (imperial) or "2.1 L" (metric). */
export function displayVolume(ml: number, units: "imperial" | "metric"): string {
  if (units === "imperial") return `${Math.round(mlToOz(ml))} oz`;
  return ml >= 1000 ? `${(ml / 1000).toFixed(1)} L` : `${Math.round(ml)} ml`;
}
