import type { Env } from "./env";
import type { Macros, StatsResponse } from "../shared/types";
import { effectiveTimezone, getSettings, genId, nowIso, rolloverHour } from "./db";
import { addDays, dateRange, daysBetween, todayTrackingDate } from "./time";
import { ageFromBirthdate, computeTargets, ewma, mifflinStJeorBMR } from "./nutrition";
import type { Settings } from "../shared/types";

const ZERO: Macros = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

export async function dayTotals(env: Env, trackingDate: string): Promise<Macros> {
  const r = await env.DB.prepare(
    `SELECT COALESCE(SUM(calories),0) c, COALESCE(SUM(protein_g),0) p,
            COALESCE(SUM(carbs_g),0) cb, COALESCE(SUM(fat_g),0) f
     FROM entries WHERE tracking_date = ?`,
  )
    .bind(trackingDate)
    .first<{ c: number; p: number; cb: number; f: number }>();
  return {
    calories: r?.c ?? 0,
    protein_g: r?.p ?? 0,
    carbs_g: r?.cb ?? 0,
    fat_g: r?.f ?? 0,
  };
}

/** Compact prose summary of the last N tracking days for coach context. */
export async function recentSummary(env: Env, endDate: string, days = 4): Promise<string> {
  const start = addDays(endDate, -(days - 1));
  const rows = await env.DB.prepare(
    `SELECT tracking_date d, SUM(calories) c, SUM(protein_g) p
     FROM entries WHERE tracking_date >= ? AND tracking_date < ?
     GROUP BY tracking_date ORDER BY tracking_date`,
  )
    .bind(start, endDate)
    .all<{ d: string; c: number; p: number }>();
  if (!rows.results.length) return "no prior days logged";
  return rows.results
    .map((r) => `${r.d.slice(5)}: ${Math.round(r.c)}kcal/${Math.round(r.p)}gP`)
    .join(", ");
}

export async function activeMemoryTexts(env: Env): Promise<string[]> {
  const rows = await env.DB.prepare(
    "SELECT text FROM memory_notes WHERE status = 'active' ORDER BY created_at",
  ).all<{ text: string }>();
  return rows.results.map((r) => r.text);
}

export async function latestWeightKg(env: Env): Promise<number | null> {
  const r = await env.DB.prepare(
    "SELECT weight_kg FROM weights ORDER BY measured_at DESC LIMIT 1",
  ).first<{ weight_kg: number }>();
  return r ? r.weight_kg : null;
}

/** Most recent measured BMR, from either a weigh-in row or a Health Connect day. */
export async function latestScaleBmr(env: Env): Promise<number | null> {
  const [w, e] = await Promise.all([
    env.DB.prepare(
      "SELECT bmr_kcal, measured_at ts FROM weights WHERE bmr_kcal IS NOT NULL ORDER BY measured_at DESC LIMIT 1",
    ).first<{ bmr_kcal: number; ts: string }>(),
    env.DB.prepare(
      "SELECT bmr_kcal, tracking_date ts FROM daily_energy WHERE bmr_kcal IS NOT NULL ORDER BY tracking_date DESC LIMIT 1",
    ).first<{ bmr_kcal: number; ts: string }>(),
  ]);
  if (w && e) {
    return Date.parse(w.ts) >= Date.parse(`${e.ts}T12:00:00Z`) ? w.bmr_kcal : e.bmr_kcal;
  }
  return w?.bmr_kcal ?? e?.bmr_kcal ?? null;
}

/** Mifflin-St Jeor BMR from the profile + latest weigh-in, or null if incomplete. */
export async function mifflinBmr(env: Env, s: Settings): Promise<number | null> {
  const weightKg = await latestWeightKg(env);
  if (s.sex && s.height_cm && s.birthdate && weightKg) {
    return Math.round(
      mifflinStJeorBMR({
        sex: s.sex,
        weightKg,
        heightCm: s.height_cm,
        age: ageFromBirthdate(s.birthdate),
      }),
    );
  }
  return null;
}

/**
 * The BMR the calculated target uses. One explicit source, chosen under Profile
 * (`bmr_mode`) — no silent fallback between them:
 *   'manual'     -> the number typed in Settings (`bmr_kcal`)
 *   'calculated' -> Mifflin-St Jeor from the profile + latest weight
 *   'synced'     -> the latest scale / Health Connect BMR
 */
export async function effectiveBmr(env: Env, s: Settings): Promise<number | null> {
  switch (s.bmr_mode) {
    case "manual":
      return s.bmr_kcal && s.bmr_kcal > 500 ? s.bmr_kcal : null;
    case "synced": {
      const synced = await latestScaleBmr(env);
      return synced == null ? null : Math.round(synced);
    }
    default:
      return mifflinBmr(env, s);
  }
}

/** Alias kept for the Today energy display. */
export const restingBmrEstimate = effectiveBmr;

/** total_kcal for a day, else active_kcal + a resting figure (day BMR, else fallback). */
function dayBurn(
  r: { total_kcal: number | null; active_kcal: number | null; bmr_kcal: number | null },
  fallbackBmr: number | null,
): number | null {
  if (r.total_kcal && r.total_kcal > 800) return r.total_kcal;
  const resting = r.bmr_kcal && r.bmr_kcal > 800 ? r.bmr_kcal : fallbackBmr;
  if (r.active_kcal != null && resting != null) return r.active_kcal + resting;
  return null;
}

export async function getDayEnergy(
  env: Env,
  date: string,
  intakeKcal: number,
  fallbackBmr: number | null,
): Promise<import("../shared/types").DayEnergy | null> {
  const r = await env.DB.prepare(
    "SELECT active_kcal, total_kcal, steps, bmr_kcal, updated_at FROM daily_energy WHERE tracking_date = ?",
  )
    .bind(date)
    .first<{
      active_kcal: number | null;
      total_kcal: number | null;
      steps: number | null;
      bmr_kcal: number | null;
      updated_at: string | null;
    }>();
  // Measured burn for the day (synced total, or active + resting BMR). When we
  // have nothing synced, fall back to BMR as the assumed minimum daily burn.
  const measured = r ? dayBurn(r, fallbackBmr) : null;
  const burned = measured ?? fallbackBmr;
  if (burned == null) return null; // no synced data and no BMR to assume
  return {
    active_kcal: r?.active_kcal ?? null,
    total_kcal: r?.total_kcal ?? null,
    steps: r?.steps ?? null,
    bmr_kcal: r?.bmr_kcal ?? null,
    burned_kcal: Math.round(burned),
    net_kcal: Math.round(intakeKcal - burned),
    basis: measured == null ? "estimated" : "measured",
    updated_at: r?.updated_at ?? null,
  };
}

// One target row per tracking day: a repeated save on the same day overwrites
// that day's row rather than appending, so "Target & BMR over time" is one point
// per day (the most recent save). Enforced by a UNIQUE index on effective_date.
export const UPSERT_TARGET = `INSERT INTO targets
   (id, effective_date, calorie_target, protein_target_g, tdee_estimate, basis, surplus_kcal, trend_weight_kg, note, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT (effective_date) DO UPDATE SET
     calorie_target   = excluded.calorie_target,
     protein_target_g = excluded.protein_target_g,
     tdee_estimate    = excluded.tdee_estimate,
     basis            = excluded.basis,
     surplus_kcal     = excluded.surplus_kcal,
     trend_weight_kg  = excluded.trend_weight_kg,
     note             = excluded.note,
     created_at       = excluded.created_at`;

/** True if the most recent target row already has these exact numbers. */
async function targetUnchanged(
  env: Env,
  cal: number,
  pro: number,
  basis: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT calorie_target, protein_target_g, basis FROM targets ORDER BY effective_date DESC, created_at DESC LIMIT 1",
  ).first<{ calorie_target: number; protein_target_g: number; basis: string }>();
  return (
    !!row &&
    Number(row.calorie_target) === cal &&
    Number(row.protein_target_g) === pro &&
    row.basis === basis
  );
}

/**
 * Recompute the calorie/protein target from profile + current weight and
 * upsert today's target row. Returns the target that was written, or null if
 * nothing could be computed. The daily cron passes `reason: "cron"` and skips
 * the write when the target hasn't moved, so the history chart doesn't gain a
 * duplicate point every quiet day.
 */
export async function recomputeTarget(
  env: Env,
  reason: "manual" | "cron" | "settings-change",
): Promise<{ calorie_target: number; protein_target_g: number; basis: string } | null> {
  const s = await getSettings(env);
  const tz = effectiveTimezone(env, s);
  const today = todayTrackingDate(tz, rolloverHour(env, s));
  const weightKg = await latestWeightKg(env);

  // --- manual override: user typed the targets in Settings ---
  if (s.target_mode === "manual" && s.manual_calorie_target && s.manual_protein_target) {
    const cal = Math.round(s.manual_calorie_target);
    const pro = Math.round(s.manual_protein_target);
    if (reason === "cron" && (await targetUnchanged(env, cal, pro, "manual"))) {
      return { calorie_target: cal, protein_target_g: pro, basis: "manual" };
    }
    const tdeeEst = await effectiveBmr(env, s); // BMR, recorded for the history graph
    await env.DB.prepare(UPSERT_TARGET)
      .bind(genId(), today, cal, pro, tdeeEst, "manual", 0, weightKg, `manual (${reason})`, nowIso())
      .run();
    return { calorie_target: cal, protein_target_g: pro, basis: "manual" };
  }

  // --- calculated: calorie target = BMR + surplus (surplus may be negative) ---
  const bmr = await effectiveBmr(env, s);
  if (bmr == null) return null; // no BMR entered or synced, no profile to estimate from
  const basis: "calculator" = "calculator";
  const trendWeightKg: number | null = weightKg;

  const computed = computeTargets({
    tdee: bmr,
    surplusKcal: s.surplus_kcal,
    weightKg: trendWeightKg,
    proteinPerKg: s.protein_g_per_kg,
  });
  const calorie_target = computed.calorie_target;
  // Protein: fixed grams if chosen, else the g/kg formula result.
  const protein_target_g =
    s.protein_mode === "fixed" && s.manual_protein_target
      ? Math.round(s.manual_protein_target)
      : computed.protein_target_g;

  if (reason === "cron" && (await targetUnchanged(env, calorie_target, protein_target_g, basis))) {
    return { calorie_target, protein_target_g, basis };
  }

  await env.DB.prepare(UPSERT_TARGET)
    .bind(
      genId(),
      today,
      calorie_target,
      protein_target_g,
      Math.round(bmr),
      basis,
      s.surplus_kcal,
      trendWeightKg,
      `auto (${reason})`,
      nowIso(),
    )
    .run();

  return { calorie_target, protein_target_g, basis };
}

// ---- stats --------------------------------------------------------------

export async function buildStats(env: Env, rangeDays: number): Promise<StatsResponse> {
  const s = await getSettings(env);
  const tz = effectiveTimezone(env, s);
  const today = todayTrackingDate(tz, rolloverHour(env, s));
  const start = addDays(today, -(rangeDays - 1));
  const dates = dateRange(start, today);

  const [entryRows, weightRows, targetRows, waterRows] = await Promise.all([
    env.DB.prepare(
      "SELECT tracking_date d, SUM(calories) c, SUM(protein_g) p, COUNT(*) n FROM entries WHERE tracking_date >= ? GROUP BY tracking_date",
    )
      .bind(start)
      .all<{ d: string; c: number; p: number; n: number }>(),
    env.DB.prepare(
      "SELECT tracking_date d, AVG(weight_kg) w, AVG(muscle_mass_kg) m FROM weights WHERE tracking_date >= ? GROUP BY tracking_date ORDER BY tracking_date",
    )
      .bind(addDays(start, -14)) // extra lead-in so the trend line is stable at the left edge
      .all<{ d: string; w: number; m: number | null }>(),
    env.DB.prepare("SELECT * FROM targets ORDER BY effective_date, created_at").all<
      Record<string, unknown>
    >(),
    env.DB.prepare(
      "SELECT tracking_date d, SUM(ml) ml FROM hydration WHERE tracking_date >= ? GROUP BY tracking_date",
    )
      .bind(start)
      .all<{ d: string; ml: number }>(),
  ]);
  const waterByDate = new Map(waterRows.results.map((r) => [r.d, r.ml]));

  const [energyRows, fallbackBmr] = await Promise.all([
    env.DB.prepare(
      "SELECT tracking_date d, total_kcal, active_kcal, bmr_kcal, steps FROM daily_energy WHERE tracking_date >= ?",
    )
      .bind(start)
      .all<{
        d: string;
        total_kcal: number | null;
        active_kcal: number | null;
        bmr_kcal: number | null;
        steps: number | null;
      }>(),
    restingBmrEstimate(env, s),
  ]);
  const energyByDate = new Map(energyRows.results.map((r) => [r.d, r]));

  const byDate = new Map(entryRows.results.map((r) => [r.d, r]));

  // resolve the active target for each day
  const sortedTargets = targetRows.results
    .map((r) => ({
      date: String(r.effective_date),
      calorie_target: Number(r.calorie_target),
      protein_target_g: Number(r.protein_target_g),
      tdee_estimate: r.tdee_estimate == null ? null : Number(r.tdee_estimate),
      basis: r.basis as StatsResponse["target_history"][number]["basis"],
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  function targetOn(date: string) {
    let cur: (typeof sortedTargets)[number] | null = null;
    for (const t of sortedTargets) {
      if (t.date <= date) cur = t;
      else break;
    }
    return cur;
  }

  const daily = dates.map((date) => {
    const e = byDate.get(date);
    const t = targetOn(date);
    const en = energyByDate.get(date);
    const dayBmr = t?.tdee_estimate ?? fallbackBmr;
    // Synced burn if we have it, otherwise assume BMR as the day's minimum burn.
    const burned = (en ? dayBurn(en, fallbackBmr) : null) ?? dayBmr;
    return {
      date,
      calories: Math.round(e?.c ?? 0),
      protein_g: Math.round(e?.p ?? 0),
      calorie_target: t?.calorie_target ?? null,
      protein_target_g: t?.protein_target_g ?? null,
      bmr_kcal: dayBmr == null ? null : Math.round(dayBmr),
      water_ml: Math.round(waterByDate.get(date) ?? 0),
      burned_kcal: burned == null ? null : Math.round(burned),
      steps: en?.steps ?? null,
      logged: (e?.n ?? 0) > 0,
    };
  });

  // weight + muscle-mass trends (same smoothing, so the two charts compare like for like)
  const trendSeries = (points: Array<{ date: string; value: number }>) => {
    const rawByDate = new Map(points.map((p) => [p.date, p.value]));
    const trend = ewma(points, 10)
      .filter((pt) => pt.date >= start)
      .map((pt) => ({
        date: pt.date,
        weight_kg: rawByDate.has(pt.date) ? Number(rawByDate.get(pt.date)!.toFixed(2)) : null,
        trend_kg: Number(pt.trend.toFixed(3)),
      }));
    let rate: number | null = null;
    if (trend.length >= 2) {
      const first = trend[0];
      const last = trend[trend.length - 1];
      const d = daysBetween(first.date, last.date);
      if (d > 0) rate = Number((((last.trend_kg - first.trend_kg) / d) * 7).toFixed(3));
    }
    return { trend, rate };
  };
  const weight = trendSeries(weightRows.results.map((r) => ({ date: r.d, value: r.w })));
  const muscle = trendSeries(
    weightRows.results
      .filter((r) => r.m != null)
      .map((r) => ({ date: r.d, value: r.m as number })),
  );
  const weight_trend = weight.trend;
  const weight_rate_kg_per_week = weight.rate;

  // adherence + streak (within 10% of calorie target AND >= 90% of protein target)
  let daysInRange = 0;
  let daysLogged = 0;
  let streak = 0;
  let streakBroken = false;
  for (let i = daily.length - 1; i >= 0; i--) {
    const day = daily[i];
    if (!day.logged || !day.calorie_target) continue;
    daysLogged++;
    const calOk = Math.abs(day.calories - day.calorie_target) <= day.calorie_target * 0.1;
    const proOk = day.protein_target_g ? day.protein_g >= day.protein_target_g * 0.9 : true;
    const inRange = calOk && proOk;
    if (inRange) daysInRange++;
    if (!streakBroken) {
      if (inRange) streak++;
      else streakBroken = true;
    }
  }

  return {
    range_days: rangeDays,
    daily,
    water_target_ml: s.hydration_target_ml,
    weight_trend,
    weight_rate_kg_per_week,
    muscle_trend: muscle.trend,
    muscle_rate_kg_per_week: muscle.rate,
    target_history: sortedTargets,
    adherence: {
      days_in_range: daysInRange,
      days_logged: daysLogged,
      pct: daysLogged ? Math.round((daysInRange / daysLogged) * 100) : 0,
      current_streak: streak,
    },
  };
}

export { ZERO as ZERO_MACROS };
