// Nutrition <-> WHOOP analysis: date pairing + simple statistics. Pure, no React.
// Kept separate from rendering so more metric pairs can plug in later.
import { addDaysISO } from "./day";
import type { InsightsNutritionDay, InsightsWhoopDay } from "../types";

export type NutritionKey =
  | "calories"
  | "protein_g"
  | "carbs_g"
  | "fat_g"
  | "water_ml"
  | "creatine_g";
export type WhoopKey = "recovery_pct" | "hrv_ms" | "resting_hr";

export interface Metric<K extends string> {
  key: K;
  label: string;
  unit: string;
}

export const NUTRITION_METRICS: Metric<NutritionKey>[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "carbs_g", label: "Carbs", unit: "g" },
  { key: "fat_g", label: "Fat", unit: "g" },
  { key: "water_ml", label: "Water", unit: "mL" },
  { key: "creatine_g", label: "Creatine", unit: "g" },
];

export const WHOOP_METRICS: Metric<WhoopKey>[] = [
  { key: "recovery_pct", label: "Recovery", unit: "%" },
  { key: "hrv_ms", label: "HRV", unit: "ms" },
  { key: "resting_hr", label: "Resting HR", unit: "bpm" },
];

export const MIN_PAIRS = 10;

export interface PairedDay {
  nutritionDate: string;
  whoopDate: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  water_ml: number | null;
  creatine_g: number | null;
  recovery_pct: number | null;
  hrv_ms: number | null;
  resting_hr: number | null;
  day_strain: number | null;
  energy_burned: number | null;
}

/**
 * Pair each nutrition day N with the WHOOP day N+lagDays.
 * lagDays = 1 for recovery / physiology, 0 for same-day (strain).
 * A pair is emitted only when a WHOOP row exists for the target date; per-metric
 * null-filtering is left to the caller (so one pass serves every metric).
 */
export function pairDays(
  nutrition: InsightsNutritionDay[],
  whoop: InsightsWhoopDay[],
  lagDays: number,
): PairedDay[] {
  const byDate = new Map(whoop.map((w) => [w.date, w]));
  const out: PairedDay[] = [];
  for (const nu of nutrition) {
    const whoopDate = lagDays === 0 ? nu.date : addDaysISO(nu.date, lagDays);
    const w = byDate.get(whoopDate);
    if (!w) continue;
    out.push({
      nutritionDate: nu.date,
      whoopDate,
      calories: nu.calories,
      protein_g: nu.protein_g,
      carbs_g: nu.carbs_g,
      fat_g: nu.fat_g,
      water_ml: nu.water_ml,
      creatine_g: nu.creatine_g,
      recovery_pct: w.recovery_pct,
      hrv_ms: w.hrv_ms,
      resting_hr: w.resting_hr,
      day_strain: w.day_strain,
      energy_burned: w.energy_burned,
    });
  }
  return out;
}

export interface XY {
  x: number;
  y: number;
}

/** Pearson correlation. null if fewer than 3 points or zero variance on either axis. */
export function pearson(pts: XY[]): number | null {
  const nPts = pts.length;
  if (nPts < 3) return null;
  let sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0,
    sxy = 0;
  for (const { x, y } of pts) {
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  const cov = sxy - (sx * sy) / nPts;
  const vx = sxx - (sx * sx) / nPts;
  const vy = syy - (sy * sy) / nPts;
  if (vx <= 0 || vy <= 0) return null;
  return cov / Math.sqrt(vx * vy);
}

/** Least-squares line. null if fewer than 2 points or no x-variance. */
export function linfit(pts: XY[]): { slope: number; intercept: number } | null {
  const nPts = pts.length;
  if (nPts < 2) return null;
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  for (const { x, y } of pts) {
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const denom = nPts * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (nPts * sxy - sx * sy) / denom;
  return { slope, intercept: (sy - slope * sx) / nPts };
}

/** Neutral, non-causal phrasing for a correlation coefficient. */
export function strengthLabel(r: number): string {
  const a = Math.abs(r);
  if (a < 0.2) return "little apparent association";
  const band = a < 0.4 ? "weak" : a < 0.6 ? "moderate" : a < 0.8 ? "strong" : "very strong";
  return `${band} ${r >= 0 ? "positive" : "negative"} association`;
}

/**
 * Optional hydration read-out for under the Water chart. Neutral, non-causal.
 * Returns null until each bucket has at least 3 days.
 */
export function hydrationRecoveryInsight(paired: PairedDay[]): string | null {
  const hi: number[] = [];
  const lo: number[] = [];
  for (const p of paired) {
    if (p.water_ml == null || p.recovery_pct == null) continue;
    if (p.water_ml >= 2500) hi.push(p.recovery_pct);
    else if (p.water_ml < 2000) lo.push(p.recovery_pct);
  }
  if (hi.length < 3 || lo.length < 3) return null;
  const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  return `In your recorded data, next-day recovery averages ${avg(hi)}% after ≥2.5 L and ${avg(lo)}% after <2.0 L.`;
}

/** "12 paired days · r = +0.31 — weak positive association" / the "more data" line. */
export function correlationCaption(pts: XY[]): string {
  if (pts.length < MIN_PAIRS) {
    return "More data is needed before calculating a meaningful trend.";
  }
  const r = pearson(pts);
  if (r == null) return "More data is needed before calculating a meaningful trend.";
  const sign = r >= 0 ? "+" : "−";
  return `${pts.length} paired days · r = ${sign}${Math.abs(r).toFixed(2)} — ${strengthLabel(r)}`;
}
