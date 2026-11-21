import { linfit } from "./insights";
import type { InsightsBodyDay, StrengthPoint } from "../types";

const DAY_MS = 86_400_000;
const dayNum = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;
/** Monday of the ISO week, as YYYY-MM-DD. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export type WeekRow = {
  week: string;
  /** % change since the first week; null where there's no data that week. */
  strength: number | null;
  weight: number | null;
  lean: number | null;
};

/**
 * Chain-linked strength index. Every time a lift is repeated, its best estimated 1RM is
 * compared with that lift's previous session (log ratio). Each lift's change within a week
 * is added up, those are averaged across the lifts done that week, and the weeks chained. New lifts don't count until their second session, so adding or dropping
 * exercises doesn't move the index, and one lift's changes telescope (last vs first).
 */
export function strengthIndex(points: StrengthPoint[]): Map<string, number> {
  const last = new Map<string, number>();
  // week -> lift -> summed log change that week (a lift done twice in a week counts once,
  // with both sessions' change added up)
  const byWeek = new Map<string, Map<string, number>>();
  for (const p of points) {
    const prev = last.get(p.norm_name);
    last.set(p.norm_name, p.e1rm_kg);
    if (prev == null || prev <= 0) continue;
    const w = weekStart(p.date);
    const lifts = byWeek.get(w) ?? new Map<string, number>();
    lifts.set(p.norm_name, (lifts.get(p.norm_name) ?? 0) + Math.log(p.e1rm_kg / prev));
    byWeek.set(w, lifts);
  }
  const out = new Map<string, number>();
  let cum = 0;
  if (points.length) out.set(weekStart(points[0].date), 0);
  for (const w of [...byWeek.keys()].sort()) {
    const lr = [...byWeek.get(w)!.values()];
    cum += lr.reduce((a, b) => a + b, 0) / lr.length;
    out.set(w, (Math.exp(cum) - 1) * 100);
  }
  return out;
}

/** Weekly % change in strength, body weight and lean mass, all from their first week. */
export function weeklyRows(points: StrengthPoint[], body: InsightsBodyDay[]): WeekRow[] {
  const idx = strengthIndex(points);
  const avgBy = (pick: (b: InsightsBodyDay) => number | null) => {
    const m = new Map<string, number[]>();
    for (const b of body) {
      const v = pick(b);
      if (v == null) continue;
      const w = weekStart(b.date);
      m.set(w, [...(m.get(w) ?? []), v]);
    }
    return new Map([...m].map(([w, vs]) => [w, vs.reduce((a, c) => a + c, 0) / vs.length]));
  };
  const weight = avgBy((b) => b.weight_kg);
  const lean = avgBy((b) =>
    b.lean_mass_kg ?? (b.weight_kg != null && b.body_fat_pct != null ? b.weight_kg * (1 - b.body_fat_pct / 100) : null),
  );

  // Start where both strength and body weight exist, so all lines share a baseline.
  if (!idx.size || !weight.size) return [];
  const first = [[...idx.keys()].sort()[0], [...weight.keys()].sort()[0]].sort()[1];
  const weeks = [...new Set([...idx.keys(), ...weight.keys(), ...lean.keys()])]
    .sort()
    .filter((w) => w >= first);
  const baseOf = (m: Map<string, number>) => weeks.map((w) => m.get(w)).find((v) => v != null) ?? null;
  // Strength index at or before the first week (it's cumulative, so carry the last value).
  const sBase = [...idx].filter(([w]) => w <= first).sort().pop()?.[1] ?? baseOf(idx) ?? 0;
  const wBase = baseOf(weight);
  const lBase = baseOf(lean);
  const pct = (v: number | undefined, base: number | null) =>
    v == null || base == null ? null : +((v / base - 1) * 100).toFixed(1);

  return weeks.map((w) => ({
    week: w,
    strength: idx.has(w) ? +(((1 + idx.get(w)! / 100) / (1 + sBase / 100) - 1) * 100).toFixed(1) : null,
    weight: pct(weight.get(w), wBase),
    lean: pct(lean.get(w), lBase),
  }));
}

/** Change along the trend line across the rows (start → end), in % points. */
export function trendChange(rows: WeekRow[], key: "strength" | "weight" | "lean"): number | null {
  const pts = rows
    .filter((r) => r[key] != null)
    .map((r) => ({ x: dayNum(r.week), y: r[key] as number }));
  if (pts.length < 3) return null;
  const f = linfit(pts);
  if (!f) return null;
  return f.slope * (pts[pts.length - 1].x - pts[0].x);
}

export type LiftChange = { name: string; sessions: number; pct: number };

/** Per-lift % change from its trend line, for lifts with 3+ sessions over 14+ days. */
export function liftChanges(points: StrengthPoint[]): LiftChange[] {
  const by = new Map<string, StrengthPoint[]>();
  for (const p of points) by.set(p.norm_name, [...(by.get(p.norm_name) ?? []), p]);
  const out: LiftChange[] = [];
  for (const [name, ps] of by) {
    if (ps.length < 3) continue;
    const xy = ps.map((p) => ({ x: dayNum(p.date), y: p.e1rm_kg }));
    const span = xy[xy.length - 1].x - xy[0].x;
    const f = linfit(xy);
    if (!f || span < 14) continue;
    const startY = f.intercept + f.slope * xy[0].x;
    if (startY <= 0) continue;
    out.push({ name, sessions: ps.length, pct: ((f.slope * span) / startY) * 100 });
  }
  return out.sort((a, b) => b.sessions - a.sessions);
}

export type LiftConsistency = {
  name: string;
  sessions: number;
  /** Weeks this lift was done, out of the weeks you trained at all in the range. */
  weeks: number;
  ofWeeks: number;
  share: number;
};

/** How consistently each lift is done: weeks trained with it / weeks with any lifting. */
export function liftConsistency(points: StrengthPoint[]): LiftConsistency[] {
  const allWeeks = new Set(points.map((p) => weekStart(p.date)));
  const by = new Map<string, { sessions: number; weeks: Set<string> }>();
  for (const p of points) {
    const e = by.get(p.norm_name) ?? { sessions: 0, weeks: new Set<string>() };
    e.sessions++;
    e.weeks.add(weekStart(p.date));
    by.set(p.norm_name, e);
  }
  return [...by]
    .map(([name, e]) => ({
      name,
      sessions: e.sessions,
      weeks: e.weeks.size,
      ofWeeks: allWeeks.size,
      share: allWeeks.size ? e.weeks.size / allWeeks.size : 0,
    }))
    .sort((a, b) => b.share - a.share || b.sessions - a.sessions);
}

/** Lifts done in at least this share of training weeks are highlighted as consistent. */
export const CONSISTENT_SHARE = 0.5;
