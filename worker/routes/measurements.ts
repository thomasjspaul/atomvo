import { Hono } from "hono";
import type { AppContext } from "../env";
import type { BodyMeasurement } from "../../shared/types";
import { effectiveTimezone, genId, getSettings, nowIso, rolloverHour } from "../db";
import { addDays, todayTrackingDate, trackingDate } from "../time";
import { optNum } from "../util";

export const measurements = new Hono<AppContext>();

const RANGE_DAYS: Record<string, number> = { "30": 30, "90": 90, "180": 180, "365": 365, all: 3650 };

const toMeasurement = (r: Record<string, unknown>): BodyMeasurement => ({
  id: String(r.id),
  measured_at: String(r.measured_at),
  date: String(r.tracking_date),
  waist_cm: r.waist_cm == null ? null : Number(r.waist_cm),
});

// GET /api/measurements?range=30|90|180|365|all — oldest first.
measurements.get("/", async (c) => {
  const days = RANGE_DAYS[String(c.req.query("range") || "180")] ?? 180;
  const s = await getSettings(c.env);
  const start = addDays(todayTrackingDate(effectiveTimezone(c.env, s), rolloverHour(c.env, s)), -(days - 1));
  const rows = await c.env.DB.prepare(
    "SELECT * FROM body_measurements WHERE tracking_date >= ? ORDER BY measured_at",
  )
    .bind(start)
    .all<Record<string, unknown>>();
  return c.json({ measurements: rows.results.map(toMeasurement) });
});

// POST /api/measurements { waist_cm } — always stored in cm; the client converts inches.
measurements.post("/", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const waist = optNum(b.waist_cm);
  if (waist == null || waist < 30 || waist > 250) return c.json({ error: "waist_cm out of range" }, 400);
  const s = await getSettings(c.env);
  const measuredAt = nowIso();
  const id = genId();
  await c.env.DB.prepare(
    "INSERT INTO body_measurements (id, measured_at, tracking_date, waist_cm, created_at) VALUES (?,?,?,?,?)",
  )
    .bind(
      id,
      measuredAt,
      trackingDate(new Date(measuredAt), effectiveTimezone(c.env, s), rolloverHour(c.env, s)),
      waist,
      measuredAt,
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM body_measurements WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json(toMeasurement(row!));
});

measurements.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM body_measurements WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});
