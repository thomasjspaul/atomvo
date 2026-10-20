import { Hono } from "hono";
import type { AppContext } from "../env";
import { timingSafeEqual } from "../auth";
import { effectiveTimezone, getSettings, nowIso, rolloverHour } from "../db";
import { lbToKg } from "../nutrition";
import { trackingDate } from "../time";
import { optNum } from "../util";
import { recomputeTarget } from "../service";
import { insertWeight } from "./weights";

export const ingest = new Hono<AppContext>();

/**
 * POST /api/ingest/weight  — called by Home Assistant when the Wyze Body Scan
 * sensor updates. Auth: `X-Ingest-Secret` header (see auth.ts / ingestAuth),
 * with the Access service-token policy as the outer layer.
 *
 * Body: { weight_lb? , weight_kg? , body_fat_pct? , bmr? , muscle_mass_lb? ,
 *         muscle_mass_kg? , measured_at? }
 */
ingest.post("/weight", async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!b) return c.json({ error: "invalid JSON body" }, 400);

  const kg = optNum(b.weight_kg);
  const lb = optNum(b.weight_lb);
  const weightKg = kg ?? (lb != null ? lbToKg(lb) : null);
  if (weightKg == null || weightKg <= 0 || weightKg > 400) {
    return c.json({ error: "weight_lb or weight_kg required" }, 400);
  }

  const muscleKg =
    optNum(b.muscle_mass_kg) ??
    (optNum(b.muscle_mass_lb) != null ? lbToKg(optNum(b.muscle_mass_lb)!) : null);

  const w = await insertWeight(c.env, {
    weight_kg: weightKg,
    measured_at: b.measured_at ? String(b.measured_at) : undefined,
    body_fat_pct: optNum(b.body_fat_pct),
    bmr_kcal: optNum(b.bmr ?? b.bmr_kcal),
    muscle_mass_kg: muscleKg,
    source: "wyze_ha",
    raw: b,
  });

  await recomputeTarget(c.env, "manual").catch(() => null);
  return c.json({ ok: true, weight: w });
});

// ---------------------------------------------------------------------------
// Health Connect webhook bridge (`com.hcwebhook.app`). That app can't send
// auth headers, so the secret is a URL path token. Mounted on the top-level
// `app` (no Access / no X-Ingest-Secret middleware) in worker/index.ts.
//
// Payload (subset used): { timestamp, app_version,
//   weight?:                [{ kilograms, time }],
//   body_fat?:              [{ percentage, time }],
//   lean_body_mass?:        [{ kilograms, time }],
//   active_calories?:       [{ calories, start_time, end_time }],
//   total_calories?:        [{ calories, start_time, end_time }],
//   steps?:                 [{ count, start_time, end_time }],
//   basal_metabolic_rate?:  [{ watts, time }] }
// Re-sent on a rolling 48h window every sync -> idempotent (upserts, values SET not added).
// ---------------------------------------------------------------------------
export const hcIngest = new Hono<AppContext>();

interface HcRecord {
  kilograms?: number;
  percentage?: number;
  calories?: number;
  count?: number;
  watts?: number;
  time?: string;
  start_time?: string;
  end_time?: string;
}
interface HcPayload {
  weight?: HcRecord[];
  body_fat?: HcRecord[];
  lean_body_mass?: HcRecord[];
  active_calories?: HcRecord[];
  total_calories?: HcRecord[];
  steps?: HcRecord[];
  basal_metabolic_rate?: HcRecord[];
}

const MATCH_WINDOW_MS = 300_000; // ±5 min to pair body-fat / lean-mass with a weigh-in
const MAX_AGE_MS = 14 * 86_400_000;
const ENERGY_MAX_AGE_MS = 21 * 86_400_000;
const WATTS_TO_KCAL_DAY = 86_400 / 4184; // 1 W over a day, in kcal

function nearestValue(
  records: HcRecord[],
  atMs: number,
  key: "percentage" | "kilograms",
): number | null {
  let best: number | null = null;
  let bestDelta = MATCH_WINDOW_MS;
  for (const r of records) {
    const t = Date.parse(r.time ?? "");
    if (!Number.isFinite(t)) continue;
    const delta = Math.abs(t - atMs);
    if (delta <= bestDelta) {
      best = optNum(r[key]);
      bestDelta = delta;
    }
  }
  return best;
}

hcIngest.post("/:token", async (c) => {
  const expected = c.env.INGEST_SHARED_SECRET;
  if (!expected) return c.json({ error: "ingest not configured (set INGEST_SHARED_SECRET)" }, 503);
  if (!timingSafeEqual(c.req.param("token") ?? "", expected)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = await c.req.json<HcPayload>().catch(() => null);
  if (!body) return c.json({ error: "invalid JSON" }, 400);

  const arr = (v: unknown): HcRecord[] => (Array.isArray(v) ? (v as HcRecord[]) : []);
  const weights = arr(body.weight);
  const bodyFat = arr(body.body_fat);
  const leanMass = arr(body.lean_body_mass);

  // ---- weigh-ins ----
  const wCutoff = Date.now() - MAX_AGE_MS;
  let weightsIngested = 0;
  for (const w of weights) {
    const kg = optNum(w.kilograms);
    const atMs = Date.parse(w.time ?? "");
    if (kg == null || kg <= 0 || kg > 400) continue;
    if (!Number.isFinite(atMs) || atMs < wCutoff || atMs > Date.now() + 86_400_000) continue;
    await insertWeight(c.env, {
      weight_kg: kg,
      measured_at: new Date(atMs).toISOString(),
      body_fat_pct: nearestValue(bodyFat, atMs, "percentage"),
      muscle_mass_kg: nearestValue(leanMass, atMs, "kilograms"),
      source: "health_connect",
      raw: w,
    });
    weightsIngested++;
  }

  // ---- daily energy: calories burned / steps / BMR, bucketed by tracking day ----
  const s = await getSettings(c.env);
  const tz = effectiveTimezone(c.env, s);
  const roll = rolloverHour(c.env, s);
  const eCutoff = Date.now() - ENERGY_MAX_AGE_MS;

  type Bucket = { active: number; total: number; steps: number; bmrW: number[] };
  const days = new Map<string, Bucket>();
  const bucket = (dateKey: string): Bucket => {
    let b = days.get(dateKey);
    if (!b) {
      b = { active: 0, total: 0, steps: 0, bmrW: [] };
      days.set(dateKey, b);
    }
    return b;
  };
  const dateOf = (r: HcRecord): string | null => {
    // Bucket by the middle of the interval so a local midnight-to-midnight daily
    // total (start just after midnight) still lands on the day it covers.
    const start = Date.parse(r.start_time ?? r.time ?? "");
    const end = Date.parse(r.end_time ?? "");
    const t = Number.isFinite(end) ? (start + end) / 2 : start;
    if (!Number.isFinite(t) || t < eCutoff || t > Date.now() + 86_400_000) return null;
    return trackingDate(new Date(t), tz, roll);
  };

  for (const r of arr(body.active_calories)) {
    const d = dateOf(r);
    const v = optNum(r.calories);
    if (d && v != null && v >= 0) bucket(d).active += v;
  }
  for (const r of arr(body.total_calories)) {
    const d = dateOf(r);
    const v = optNum(r.calories);
    if (d && v != null && v >= 0) bucket(d).total += v;
  }
  for (const r of arr(body.steps)) {
    const d = dateOf(r);
    const v = optNum(r.count);
    if (d && v != null && v >= 0) bucket(d).steps += v;
  }
  for (const r of arr(body.basal_metabolic_rate)) {
    const d = dateOf(r);
    const w = optNum(r.watts);
    if (d && w != null && w > 0) bucket(d).bmrW.push(w);
  }

  let latestBmrKcal: { date: string; kcal: number } | null = null;
  for (const [date, b] of days) {
    const active = b.active > 0 ? Math.round(b.active) : null;
    const total = b.total > 0 ? Math.round(b.total) : null;
    const steps = b.steps > 0 ? Math.round(b.steps) : null;
    const bmrKcal =
      b.bmrW.length > 0
        ? Math.round((b.bmrW.reduce((x, y) => x + y, 0) / b.bmrW.length) * WATTS_TO_KCAL_DAY)
        : null;
    if (bmrKcal != null && (!latestBmrKcal || date > latestBmrKcal.date)) {
      latestBmrKcal = { date, kcal: bmrKcal };
    }
    if (active == null && total == null && steps == null && bmrKcal == null) continue;
    await c.env.DB.prepare(
      `INSERT INTO daily_energy (tracking_date, active_kcal, total_kcal, steps, bmr_kcal, source, updated_at)
       VALUES (?,?,?,?,?, 'health_connect', ?)
       ON CONFLICT (tracking_date) DO UPDATE SET
         active_kcal = COALESCE(excluded.active_kcal, daily_energy.active_kcal),
         total_kcal  = COALESCE(excluded.total_kcal, daily_energy.total_kcal),
         steps       = COALESCE(excluded.steps, daily_energy.steps),
         bmr_kcal    = COALESCE(excluded.bmr_kcal, daily_energy.bmr_kcal),
         updated_at  = excluded.updated_at`,
    )
      .bind(date, active, total, steps, bmrKcal, nowIso())
      .run();
  }

  // keep the BMR the target uses in step with the scale / Health Connect
  if (latestBmrKcal && latestBmrKcal.kcal > 600 && latestBmrKcal.kcal < 5000) {
    await c.env.DB.prepare("UPDATE settings SET bmr_kcal = ? WHERE id = 1")
      .bind(Math.round(latestBmrKcal.kcal))
      .run();
  }

  if (weightsIngested > 0 || days.size > 0) {
    await recomputeTarget(c.env, "manual").catch(() => null);
  }
  return c.json({ ok: true, ingested: weightsIngested, energy_days: days.size });
});
