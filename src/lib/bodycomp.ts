import { linfit } from "./insights";
import type { InsightsBodyDay } from "../types";

export const MIN_READINGS = 4;
export const MIN_SPAN_DAYS = 14;
/** Below this total change (kg) the lean/fat split is noise, not signal. */
export const STEADY_KG = 0.5;

export type CompPoint = { iso: string; day: number; lean: number; fat: number };

/** Readings with both lean and fat mass (kg), filling either from weight + body fat % if missing. */
export function compPoints(body: InsightsBodyDay[]): CompPoint[] {
  const out: CompPoint[] = [];
  for (const b of body) {
    const fat =
      b.fat_mass_kg ??
      (b.weight_kg != null && b.body_fat_pct != null ? (b.weight_kg * b.body_fat_pct) / 100 : null);
    const lean = b.lean_mass_kg ?? (b.weight_kg != null && fat != null ? b.weight_kg - fat : null);
    if (lean == null || fat == null) continue;
    out.push({ iso: b.date, day: Date.parse(`${b.date}T00:00:00Z`) / 86_400_000, lean, fat });
  }
  return out;
}

export type CompChange = { dLean: number; dFat: number; span: number; n: number };

/**
 * Change in lean and fat across the points, from least-squares trend lines (so single-day
 * scale swings barely count). null when there are too few readings or too short a span.
 */
export function compChange(
  pts: CompPoint[],
  minReadings = MIN_READINGS,
  minSpan = MIN_SPAN_DAYS,
): CompChange | null {
  if (pts.length < minReadings) return null;
  const span = pts[pts.length - 1].day - pts[0].day;
  if (span < minSpan) return null;
  const lf = linfit(pts.map((p) => ({ x: p.day, y: p.lean })));
  const ff = linfit(pts.map((p) => ({ x: p.day, y: p.fat })));
  if (!lf || !ff) return null;
  return { dLean: lf.slope * span, dFat: ff.slope * span, span, n: pts.length };
}

/**
 * Lean-vs-fat balance, 0–100. Above 50 = lean is winning, whatever the direction:
 * gaining → % of the gain that is lean; losing → % of the loss that is fat;
 * recomp (lean up, fat down) → 100; fat up and lean down → 0.
 * null when the total change is too small to mean anything.
 */
export function balanceScore(dLean: number, dFat: number): number | null {
  const total = Math.abs(dLean) + Math.abs(dFat);
  if (total < STEADY_KG) return null;
  return 50 + (50 * (dLean - dFat)) / total;
}

/**
 * Rolling balance: at each reading, the balance over the previous `windowDays`.
 * Points need at least half the window covered by readings.
 */
export function rollingBalance(
  pts: CompPoint[],
  windowDays: number,
): Array<{ iso: string; score: number | null }> {
  const out: Array<{ iso: string; score: number | null }> = [];
  let start = 0;
  for (let i = 0; i < pts.length; i++) {
    while (pts[i].day - pts[start].day > windowDays) start++;
    if (pts[i].day - pts[0].day < windowDays) continue; // not a full window of history yet
    const c = compChange(pts.slice(start, i + 1), MIN_READINGS, windowDays / 2);
    out.push({ iso: pts[i].iso, score: c ? balanceScore(c.dLean, c.dFat) : null });
  }
  return out;
}
