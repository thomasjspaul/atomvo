import { Hono } from "hono";
import type { AppContext } from "../env";
import {
  effectiveTimezone,
  genId,
  getSettings,
  nowIso,
  rolloverHour,
  rowToEntry,
  rowToFavourite,
} from "../db";
import { trackingDate } from "../time";
import { num } from "../util";

export const favourites = new Hono<AppContext>();

favourites.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM favourites ORDER BY use_count DESC, last_used_at DESC, name",
  ).all<Record<string, unknown>>();
  return c.json({ favourites: rows.results.map(rowToFavourite) });
});

favourites.post("/", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  if (!b.name) return c.json({ error: "name required" }, 400);
  const id = genId();
  await c.env.DB.prepare(
    "INSERT INTO favourites (id, name, calories, protein_g, carbs_g, fat_g, creatine_g, source_entry_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      id,
      String(b.name),
      Math.max(0, num(b.calories)),
      Math.max(0, num(b.protein_g)),
      Math.max(0, num(b.carbs_g)),
      Math.max(0, num(b.fat_g)),
      b.creatine_g == null ? null : Math.max(0, num(b.creatine_g)),
      b.source_entry_id ? String(b.source_entry_id) : null,
      nowIso(),
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM favourites WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json(rowToFavourite(row!));
});

favourites.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<Record<string, unknown>>();
  const fields: string[] = [];
  const vals: unknown[] = [];
  for (const k of ["name", "calories", "protein_g", "carbs_g", "fat_g"] as const) {
    if (b[k] !== undefined) {
      fields.push(`${k} = ?`);
      vals.push(k === "name" ? String(b[k]) : Math.max(0, num(b[k])));
    }
  }
  if (b.creatine_g !== undefined) {
    fields.push("creatine_g = ?");
    vals.push(b.creatine_g === null ? null : Math.max(0, num(b.creatine_g)));
  }
  if (!fields.length) return c.json({ error: "nothing to update" }, 400);
  vals.push(id);
  const res = await c.env.DB.prepare(`UPDATE favourites SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...vals)
    .run();
  if (!res.meta.changes) return c.json({ error: "not found" }, 404);
  const row = await c.env.DB.prepare("SELECT * FROM favourites WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json(rowToFavourite(row!));
});

favourites.delete("/:id", async (c) => {
  const res = await c.env.DB.prepare("DELETE FROM favourites WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  if (!res.meta.changes) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

// POST /api/favourites/:id/log  — one-tap, no AI call, no coach message
favourites.post("/:id/log", async (c) => {
  const fav = await c.env.DB.prepare("SELECT * FROM favourites WHERE id = ?")
    .bind(c.req.param("id"))
    .first<Record<string, unknown>>();
  if (!fav) return c.json({ error: "not found" }, 404);

  const s = await getSettings(c.env);
  const tz = effectiveTimezone(c.env, s);
  const roll = rolloverHour(c.env, s);
  const body = await c.req.json<{ occurred_at?: string }>().catch(() => ({}) as { occurred_at?: string });
  const occurredAt = body.occurred_at ? new Date(body.occurred_at).toISOString() : nowIso();
  const tDate = trackingDate(new Date(occurredAt), tz, roll);
  const id = genId();

  await c.env.DB.prepare(
    `INSERT INTO entries (id, occurred_at, tracking_date, source, title, calories, protein_g, carbs_g, fat_g, creatine_g, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id,
      occurredAt,
      tDate,
      "favourite",
      String(fav.name),
      Number(fav.calories),
      Number(fav.protein_g),
      Number(fav.carbs_g),
      Number(fav.fat_g),
      fav.creatine_g == null ? null : Number(fav.creatine_g),
      nowIso(),
      nowIso(),
    )
    .run();
  await c.env.DB.prepare(
    "UPDATE favourites SET use_count = use_count + 1, last_used_at = ? WHERE id = ?",
  )
    .bind(nowIso(), c.req.param("id"))
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM entries WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json({ entry: rowToEntry(row!) });
});
