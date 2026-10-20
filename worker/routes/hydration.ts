import { Hono } from "hono";
import type { AppContext } from "../env";
import type { HydrationEntry } from "../../shared/types";
import { effectiveTimezone, genId, getSettings, nowIso, rolloverHour } from "../db";
import { trackingDate } from "../time";
import { num } from "../util";

export const hydration = new Hono<AppContext>();

// A caffeinated drink is counted at 80% toward the water goal. (The science says
// habitual coffee/tea is closer to ~100%, but a mild discount is a common choice.)
const CAFFEINE_FACTOR = 0.8;

function rowToHydration(r: Record<string, unknown>): HydrationEntry {
  return {
    id: String(r.id),
    occurred_at: String(r.occurred_at),
    ml: Number(r.ml),
    volume_ml: r.volume_ml == null ? Number(r.ml) : Number(r.volume_ml),
    kind: r.kind === "caffeine" ? "caffeine" : "water",
  };
}

hydration.get("/", async (c) => {
  const s = await getSettings(c.env);
  const tz = effectiveTimezone(c.env, s);
  const date = c.req.query("date") || trackingDate(new Date(), tz, rolloverHour(c.env, s));
  const rows = await c.env.DB.prepare(
    "SELECT * FROM hydration WHERE tracking_date = ? ORDER BY occurred_at",
  )
    .bind(date)
    .all<Record<string, unknown>>();
  const entries = rows.results.map(rowToHydration);
  return c.json({
    date,
    total_ml: Math.round(entries.reduce((a, e) => a + e.ml, 0)),
    target_ml: s.hydration_target_ml,
    entries,
  });
});

// POST /api/hydration  { volume_ml (or ml), kind?, occurred_at? }   (metric)
hydration.post("/", async (c) => {
  const b = await c.req.json<{ ml?: number; volume_ml?: number; kind?: string; occurred_at?: string }>();
  const volume = Math.round(num(b.volume_ml ?? b.ml));
  if (!Number.isFinite(volume) || volume <= 0 || volume > 5000) {
    return c.json({ error: "volume must be 1–5000 ml" }, 400);
  }
  const kind = b.kind === "caffeine" ? "caffeine" : "water";
  const counted = kind === "caffeine" ? Math.round(volume * CAFFEINE_FACTOR) : volume;

  const s = await getSettings(c.env);
  const tz = effectiveTimezone(c.env, s);
  const roll = rolloverHour(c.env, s);
  const occurredAt = b.occurred_at ? new Date(b.occurred_at).toISOString() : nowIso();
  const id = genId();
  await c.env.DB.prepare(
    "INSERT INTO hydration (id, occurred_at, tracking_date, ml, volume_ml, kind, source, created_at) VALUES (?,?,?,?,?,?,?,?)",
  )
    .bind(
      id,
      occurredAt,
      trackingDate(new Date(occurredAt), tz, roll),
      counted,
      volume,
      kind,
      "manual",
      nowIso(),
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM hydration WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json(rowToHydration(row!));
});

hydration.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM hydration WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});
