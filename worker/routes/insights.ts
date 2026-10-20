import { Hono } from "hono";
import type { AppContext } from "../env";
import type {
  InsightsBodyDay,
  InsightsNutritionDay,
  InsightsResponse,
  InsightsWhoopDay,
  InsightsWorkout,
} from "../../shared/types";
import { effectiveTimezone, getSettings, rolloverHour } from "../db";
import { addDays, todayTrackingDate } from "../time";

export const insights = new Hono<AppContext>();

const RANGE_DAYS: Record<string, number> = { "30": 30, "90": 90, "180": 180, "365": 365, all: 730 };

const n = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const round1 = (x: number) => Math.round(x * 10) / 10;

const BODY_COLS = [
  "weight_kg",
  "body_fat_pct",
  "bmi",
  "muscle_mass_kg",
  "lean_mass_kg",
  "fat_mass_kg",
  "bone_mass_kg",
  "body_water_pct",
  "protein_pct",
  "visceral_fat",
  "metabolic_age",
  "skeletal_muscle_pct",
  "subcutaneous_fat_pct",
] as const;

const BODY_SELECT = `SELECT tracking_date d, ${BODY_COLS.join(", ")} FROM weights WHERE source = 'wyze_scale'`;

function toBodyDay(date: string, r: Record<string, unknown>): InsightsBodyDay {
  const row: Record<string, unknown> = { date };
  for (const c of BODY_COLS) row[c] = n(r[c]);
  return row as unknown as InsightsBodyDay;
}

// GET /api/insights?range=30|90|180|365|all
insights.get("/", async (c) => {
  const key = String(c.req.query("range") || "90");
  const days = RANGE_DAYS[key] ?? 90;

  const s = await getSettings(c.env);
  const tz = effectiveTimezone(c.env, s);
  const start = addDays(todayTrackingDate(tz, rolloverHour(c.env, s)), -(days - 1));

  const [nutriRows, waterRows, cycleRows, workoutRows, bodyRows, bodyLatestRow] =
    await Promise.all([
    c.env.DB.prepare(
      `SELECT tracking_date d, SUM(calories) cal, SUM(protein_g) p, SUM(carbs_g) cb, SUM(fat_g) f,
              SUM(creatine_g) crt, COUNT(*) n
       FROM entries WHERE tracking_date >= ? GROUP BY tracking_date`,
    )
      .bind(start)
      .all<{ d: string; cal: number; p: number; cb: number; f: number; crt: number | null; n: number }>(),
    c.env.DB.prepare(
      "SELECT tracking_date d, SUM(ml) ml FROM hydration WHERE tracking_date >= ? GROUP BY tracking_date",
    )
      .bind(start)
      .all<{ d: string; ml: number }>(),
    c.env.DB.prepare(
      `SELECT tracking_date d,
              json_extract(data,'$."Recovery score %"') recovery,
              json_extract(data,'$."Heart rate variability (ms)"') hrv,
              json_extract(data,'$."Resting heart rate (bpm)"') rhr,
              json_extract(data,'$."Day Strain"') strain,
              json_extract(data,'$."Energy burned (cal)"') burned
       FROM whoop_data WHERE file = 'cycles' AND tracking_date >= ?
       ORDER BY tracking_date, occurred_at`,
    )
      .bind(start)
      .all<Record<string, unknown>>(),
    c.env.DB.prepare(
      `SELECT tracking_date d,
              json_extract(data,'$."Activity name"') activity,
              json_extract(data,'$."Activity Strain"') strain,
              json_extract(data,'$."Energy burned (cal)"') burned,
              json_extract(data,'$."Duration (min)"') dur
       FROM whoop_data WHERE file = 'workouts' AND tracking_date >= ?
       ORDER BY tracking_date`,
    )
      .bind(start)
      .all<Record<string, unknown>>(),
    c.env.DB.prepare(`${BODY_SELECT} AND tracking_date >= ? ORDER BY tracking_date, measured_at`)
      .bind(start)
      .all<Record<string, unknown>>(),
    c.env.DB.prepare(`${BODY_SELECT} ORDER BY measured_at DESC LIMIT 1`).first<
      Record<string, unknown>
    >(),
  ]);

  // --- nutrition: union of entry days and hydration days ---
  const nut = new Map<string, InsightsNutritionDay>();
  const ensure = (d: string): InsightsNutritionDay => {
    let row = nut.get(d);
    if (!row) {
      row = {
        date: d,
        calories: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
        water_ml: null,
        creatine_g: null,
      };
      nut.set(d, row);
    }
    return row;
  };
  for (const r of nutriRows.results) {
    const row = ensure(r.d);
    row.calories = Math.round(r.cal ?? 0);
    row.protein_g = Math.round(r.p ?? 0);
    row.carbs_g = Math.round(r.cb ?? 0);
    row.fat_g = Math.round(r.f ?? 0);
    row.creatine_g = r.crt == null ? null : round1(r.crt);
  }
  for (const r of waterRows.results) ensure(r.d).water_ml = Math.round(r.ml ?? 0);
  const nutrition = [...nut.values()].sort((a, b) => a.date.localeCompare(b.date));

  // --- whoop cycles: one per day, keep the last non-null per field ---
  const wmap = new Map<string, InsightsWhoopDay>();
  for (const r of cycleRows.results) {
    const d = String(r.d);
    const cur =
      wmap.get(d) ??
      ({
        date: d,
        recovery_pct: null,
        hrv_ms: null,
        resting_hr: null,
        day_strain: null,
        energy_burned: null,
      } satisfies InsightsWhoopDay);
    cur.recovery_pct = n(r.recovery) ?? cur.recovery_pct;
    cur.hrv_ms = n(r.hrv) ?? cur.hrv_ms;
    cur.resting_hr = n(r.rhr) ?? cur.resting_hr;
    cur.day_strain = n(r.strain) ?? cur.day_strain;
    cur.energy_burned = n(r.burned) ?? cur.energy_burned;
    wmap.set(d, cur);
  }
  const whoop_days = [...wmap.values()].sort((a, b) => a.date.localeCompare(b.date));

  const workouts: InsightsWorkout[] = workoutRows.results.map((r) => ({
    date: String(r.d),
    activity: r.activity == null ? "Workout" : String(r.activity),
    strain: n(r.strain) == null ? null : round1(n(r.strain)!),
    energy_burned: n(r.burned) == null ? null : Math.round(n(r.burned)!),
    duration_min: n(r.dur) == null ? null : Math.round(n(r.dur)!),
  }));

  // --- body composition: latest Wyze reading per tracking day ---
  const bmap = new Map<string, InsightsBodyDay>();
  for (const r of bodyRows.results) bmap.set(String(r.d), toBodyDay(String(r.d), r));
  const body = [...bmap.values()].sort((a, b) => a.date.localeCompare(b.date));
  const body_latest = bodyLatestRow ? toBodyDay(String(bodyLatestRow.d), bodyLatestRow) : null;

  const res: InsightsResponse = {
    range_days: days,
    nutrition,
    whoop_days,
    workouts,
    body,
    body_latest,
  };
  return c.json(res);
});
