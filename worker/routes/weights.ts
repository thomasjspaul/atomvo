import { Hono } from "hono";
import type { AppContext } from "../env";
import {
  effectiveTimezone,
  genId,
  getSettings,
  nowIso,
  rolloverHour,
  rowToWeight,
} from "../db";
import { addDays, trackingDate } from "../time";
import { ewma, lbToKg } from "../nutrition";
import { num, optNum } from "../util";
import { recomputeTarget } from "../service";

export const weights = new Hono<AppContext>();

weights.get("/", async (c) => {
  const limit = Math.min(365, Math.max(1, Number(c.req.query("limit") || "120")));
  const rows = await c.env.DB.prepare("SELECT * FROM weights ORDER BY measured_at DESC LIMIT ?")
    .bind(limit)
    .all<Record<string, unknown>>();
  return c.json({ weights: rows.results.map(rowToWeight) });
});

weights.get("/trend", async (c) => {
  const days = Math.min(365, Math.max(7, Number(c.req.query("days") || "90")));
  const s = await getSettings(c.env);
  const tz = effectiveTimezone(c.env, s);
  const start = addDays(trackingDate(new Date(), tz, rolloverHour(c.env, s)), -(days - 1));
  const rows = await c.env.DB.prepare(
    "SELECT tracking_date d, AVG(weight_kg) w FROM weights WHERE tracking_date >= ? GROUP BY tracking_date ORDER BY tracking_date",
  )
    .bind(addDays(start, -14))
    .all<{ d: string; w: number }>();
  const smoothed = ewma(rows.results.map((r) => ({ date: r.d, value: r.w })), 10);
  const raw = new Map(rows.results.map((r) => [r.d, r.w]));
  return c.json({
    trend: smoothed
      .filter((p) => p.date >= start)
      .map((p) => ({
        date: p.date,
        weight_kg: raw.has(p.date) ? Number(raw.get(p.date)!.toFixed(2)) : null,
        trend_kg: Number(p.trend.toFixed(3)),
      })),
  });
});

// shared insert used by manual entry and the HA ingest route
export async function insertWeight(
  env: AppContext["Bindings"],
  input: {
    weight_kg: number;
    measured_at?: string;
    body_fat_pct?: number | null;
    bmr_kcal?: number | null;
    muscle_mass_kg?: number | null;
    source: "manual" | "wyze_ha" | "wyze_scale" | "health_connect" | "other";
    raw?: unknown;
  },
) {
  const s = await getSettings(env);
  const tz = effectiveTimezone(env, s);
  const roll = rolloverHour(env, s);
  const measuredAt = input.measured_at ? new Date(input.measured_at).toISOString() : nowIso();
  const id = genId();
  await env.DB.prepare(
    `INSERT INTO weights (id, measured_at, tracking_date, weight_kg, body_fat_pct, bmr_kcal, muscle_mass_kg, source, raw_json, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT (measured_at, source) DO UPDATE SET
       weight_kg=excluded.weight_kg,
       body_fat_pct=COALESCE(excluded.body_fat_pct, weights.body_fat_pct),
       bmr_kcal=COALESCE(excluded.bmr_kcal, weights.bmr_kcal),
       muscle_mass_kg=COALESCE(excluded.muscle_mass_kg, weights.muscle_mass_kg),
       raw_json=excluded.raw_json`,
  )
    .bind(
      id,
      measuredAt,
      trackingDate(new Date(measuredAt), tz, roll),
      input.weight_kg,
      input.body_fat_pct ?? null,
      input.bmr_kcal ?? null,
      input.muscle_mass_kg ?? null,
      input.source,
      input.raw ? JSON.stringify(input.raw) : null,
      nowIso(),
    )
    .run();
  if (input.bmr_kcal != null && input.bmr_kcal > 600 && input.bmr_kcal < 5000) {
    await env.DB.prepare("UPDATE settings SET bmr_kcal = ? WHERE id = 1")
      .bind(Math.round(input.bmr_kcal))
      .run();
  }
  const row = await env.DB.prepare(
    "SELECT * FROM weights WHERE measured_at = ? AND source = ?",
  )
    .bind(measuredAt, input.source)
    .first<Record<string, unknown>>();
  return rowToWeight(row!);
}

// POST /api/weights  — manual entry (body weight in the user's display units)
weights.post("/", async (c) => {
  const s = await getSettings(c.env);
  const b = await c.req.json<Record<string, unknown>>();
  const rawWeight = optNum(b.weight_kg ?? b.weight);
  const rawLb = optNum(b.weight_lb);
  let weightKg: number | null = rawWeight;
  if (weightKg == null && rawLb != null) weightKg = lbToKg(rawLb);
  if (weightKg == null && b.weight != null && s.units === "imperial") {
    weightKg = lbToKg(num(b.weight));
  }
  if (weightKg == null || weightKg <= 0) return c.json({ error: "weight required" }, 400);

  const w = await insertWeight(c.env, {
    weight_kg: weightKg,
    measured_at: b.measured_at ? String(b.measured_at) : undefined,
    body_fat_pct: optNum(b.body_fat_pct),
    bmr_kcal: optNum(b.bmr_kcal ?? b.bmr),
    muscle_mass_kg: optNum(b.muscle_mass_kg),
    source: "manual",
    raw: b,
  });

  // keep targets fresh as weight moves
  await recomputeTarget(c.env, "manual").catch(() => null);
  return c.json(w);
});

weights.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM weights WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});
