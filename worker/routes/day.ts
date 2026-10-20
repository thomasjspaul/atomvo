import { Hono } from "hono";
import type { AppContext } from "../env";
import type { DayResponse } from "../../shared/types";
import {
  effectiveTimezone,
  getActiveTarget,
  getSettings,
  rolloverHour,
  rowToCoach,
  rowToEntry,
} from "../db";
import { hoursLeftInDay, trackingDate } from "../time";
import { dayTotals, getDayEnergy, restingBmrEstimate } from "../service";

type HydrationRow = {
  id: string;
  occurred_at: string;
  ml: number;
  volume_ml: number | null;
  kind: string | null;
};

export const day = new Hono<AppContext>();

// GET /api/day?date=YYYY-MM-DD  (defaults to the current tracking day)
day.get("/", async (c) => {
  const s = await getSettings(c.env);
  const tz = effectiveTimezone(c.env, s);
  const roll = rolloverHour(c.env, s);
  const date = c.req.query("date") || trackingDate(new Date(), tz, roll);

  const [entryRows, coachRows, totals, target, hydrationRows] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM entries WHERE tracking_date = ? ORDER BY occurred_at")
      .bind(date)
      .all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM coach_messages WHERE tracking_date = ? ORDER BY created_at")
      .bind(date)
      .all<Record<string, unknown>>(),
    dayTotals(c.env, date),
    getActiveTarget(c.env, date),
    s.hydration_target_ml > 0
      ? c.env.DB.prepare(
          "SELECT id, occurred_at, ml, volume_ml, kind FROM hydration WHERE tracking_date = ? ORDER BY occurred_at",
        )
          .bind(date)
          .all<HydrationRow>()
      : Promise.resolve({ results: [] as HydrationRow[] }),
  ]);

  const res: DayResponse = {
    tracking_date: date,
    target,
    totals,
    remaining: {
      calories: Math.round((target?.calorie_target ?? 0) - totals.calories),
      protein_g: Math.round((target?.protein_target_g ?? 0) - totals.protein_g),
    },
    entries: entryRows.results.map(rowToEntry),
    coach_messages: coachRows.results.map(rowToCoach),
    hours_left_in_day: hoursLeftInDay(new Date(), tz, roll),
    energy: await getDayEnergy(
      c.env,
      date,
      totals.calories,
      await restingBmrEstimate(c.env, s),
    ),
    hydration:
      s.hydration_target_ml > 0
        ? {
            target_ml: s.hydration_target_ml,
            total_ml: Math.round(hydrationRows.results.reduce((a, e) => a + e.ml, 0)),
            entries: hydrationRows.results.map((e) => ({
              id: e.id,
              occurred_at: e.occurred_at,
              ml: e.ml,
              volume_ml: e.volume_ml ?? e.ml,
              kind: e.kind === "caffeine" ? ("caffeine" as const) : ("water" as const),
            })),
          }
        : null,
  };
  return c.json(res);
});
