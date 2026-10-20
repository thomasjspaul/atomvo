import { Hono } from "hono";
import type { AppContext } from "../env";
import { genId, getSettings, nowIso, rowToGym } from "../db";
import { bool } from "../util";

export const gyms = new Hono<AppContext>();

gyms.get("/", async (c) => {
  const [rows, s] = await Promise.all([
    c.env.DB.prepare(
      "SELECT * FROM gyms WHERE archived = 0 ORDER BY name",
    ).all<Record<string, unknown>>(),
    getSettings(c.env),
  ]);
  return c.json({ gyms: rows.results.map(rowToGym), current_gym_id: s.current_gym_id });
});

gyms.post("/", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const name = String(b.name ?? "").trim();
  if (!name) return c.json({ error: "name required" }, 400);
  const id = genId();
  await c.env.DB.prepare(
    "INSERT INTO gyms (id, name, location, created_at) VALUES (?,?,?,?)",
  )
    .bind(id, name, b.location ? String(b.location) : null, nowIso())
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM gyms WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json(rowToGym(row!));
});

gyms.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<Record<string, unknown>>();
  const fields: string[] = [];
  const vals: unknown[] = [];
  if (b.name !== undefined) {
    fields.push("name = ?");
    vals.push(String(b.name));
  }
  if (b.location !== undefined) {
    fields.push("location = ?");
    vals.push(b.location ? String(b.location) : null);
  }
  if (b.archived !== undefined) {
    fields.push("archived = ?");
    vals.push(bool(b.archived) ? 1 : 0);
  }
  if (!fields.length) return c.json({ error: "nothing to update" }, 400);
  vals.push(id);
  const res = await c.env.DB.prepare(`UPDATE gyms SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...vals)
    .run();
  if (!res.meta.changes) return c.json({ error: "not found" }, 404);
  const row = await c.env.DB.prepare("SELECT * FROM gyms WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json(rowToGym(row!));
});

gyms.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const res = await c.env.DB.prepare("DELETE FROM gyms WHERE id = ?").bind(id).run();
  if (!res.meta.changes) return c.json({ error: "not found" }, 404);
  // drop the dangling pointer if this was the current gym
  await c.env.DB.prepare(
    "UPDATE settings SET current_gym_id = NULL WHERE id = 1 AND current_gym_id = ?",
  )
    .bind(id)
    .run();
  return c.json({ ok: true });
});

// POST /api/gyms/:id/select — set the default gym for new sessions
gyms.post("/:id/select", async (c) => {
  const id = c.req.param("id");
  const found = await c.env.DB.prepare("SELECT id FROM gyms WHERE id = ?").bind(id).first();
  if (!found) return c.json({ error: "not found" }, 404);
  await c.env.DB.prepare("UPDATE settings SET current_gym_id = ? WHERE id = 1").bind(id).run();
  return c.json({ current_gym_id: id });
});
