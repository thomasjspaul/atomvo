import { Hono } from "hono";
import type { AppContext } from "../env";
import {
  effectiveTimezone,
  genId,
  getActiveTarget,
  getSettings,
  nowIso,
  rolloverHour,
  rowToTarget,
} from "../db";
import { todayTrackingDate } from "../time";
import { num } from "../util";
import { UPSERT_TARGET } from "../service";

export const targets = new Hono<AppContext>();

targets.get("/", async (c) => {
  const t = await getActiveTarget(c.env);
  return c.json({ target: t });
});

targets.get("/history", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM targets ORDER BY effective_date DESC, created_at DESC LIMIT 200",
  ).all<Record<string, unknown>>();
  return c.json({ history: rows.results.map(rowToTarget) });
});

// PUT /api/targets  — manual override. Upserts today's 'manual' target row.
targets.put("/", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const cal = Math.round(num(b.calorie_target));
  const pro = Math.round(num(b.protein_target_g));
  if (cal < 800 || pro < 20) return c.json({ error: "unrealistic target" }, 400);

  const s = await getSettings(c.env);
  const tz = effectiveTimezone(c.env, s);
  const today = todayTrackingDate(tz, rolloverHour(c.env, s));
  await c.env.DB.prepare(UPSERT_TARGET)
    .bind(genId(), today, cal, pro, null, "manual", s.surplus_kcal, null, "manual override", nowIso())
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM targets WHERE effective_date = ?")
    .bind(today)
    .first<Record<string, unknown>>();
  return c.json(rowToTarget(row!));
});
