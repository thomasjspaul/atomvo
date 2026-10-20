import { Hono } from "hono";
import type { AppContext } from "../env";
import { genId, nowIso, rowToMemory } from "../db";

export const memory = new Hono<AppContext>();

// GET /api/memory  -> { active, suggested, archived }
memory.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM memory_notes ORDER BY created_at DESC",
  ).all<Record<string, unknown>>();
  const all = rows.results.map(rowToMemory);
  return c.json({
    active: all.filter((n) => n.status === "active"),
    suggested: all.filter((n) => n.status === "suggested"),
    archived: all.filter((n) => n.status === "archived"),
  });
});

memory.post("/", async (c) => {
  const b = await c.req.json<{ text?: string; category?: string }>();
  if (!b.text?.trim()) return c.json({ error: "text required" }, 400);
  const id = genId();
  await c.env.DB.prepare(
    "INSERT INTO memory_notes (id, text, category, status, origin, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
  )
    .bind(id, b.text.trim(), b.category?.trim() || null, "active", "user", nowIso(), nowIso())
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM memory_notes WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json(rowToMemory(row!));
});

memory.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<{ text?: string; category?: string; status?: string }>();
  const fields: string[] = ["updated_at = ?"];
  const vals: unknown[] = [nowIso()];
  if (b.text !== undefined) {
    fields.push("text = ?");
    vals.push(String(b.text).trim());
  }
  if (b.category !== undefined) {
    fields.push("category = ?");
    vals.push(b.category ? String(b.category).trim() : null);
  }
  if (b.status && ["active", "archived", "suggested"].includes(b.status)) {
    fields.push("status = ?");
    vals.push(b.status);
  }
  vals.push(id);
  const res = await c.env.DB.prepare(`UPDATE memory_notes SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...vals)
    .run();
  if (!res.meta.changes) return c.json({ error: "not found" }, 404);
  const row = await c.env.DB.prepare("SELECT * FROM memory_notes WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json(rowToMemory(row!));
});

// accept an AI suggestion -> becomes an active note
memory.post("/:id/accept", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare(
    "UPDATE memory_notes SET status = 'active', updated_at = ? WHERE id = ? AND status = 'suggested'",
  )
    .bind(nowIso(), id)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM memory_notes WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(rowToMemory(row));
});

memory.post("/:id/reject", async (c) => {
  await c.env.DB.prepare("DELETE FROM memory_notes WHERE id = ? AND status = 'suggested'")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

memory.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM memory_notes WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});
