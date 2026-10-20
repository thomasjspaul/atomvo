import { Hono } from "hono";
import type { AppContext } from "../env";
import { genId, nowIso } from "../db";
import { bool, num, optNum } from "../util";
import {
  allTemplates,
  deleteTemplateCascade,
  resolveExercise,
  templateWithItems,
} from "../gym";

export const workoutTemplates = new Hono<AppContext>();

/**
 * Replace a template's items from a raw `items` array. Each entry is one slot
 * `{ name, catalog_id?, target_*, notes?, alternatives?: [{name, catalog_id?}] }`;
 * a slot's rows share a generated group_key (primary first).
 */
async function writeItems(
  env: AppContext["Bindings"],
  templateId: string,
  raw: unknown,
): Promise<void> {
  const slots = (Array.isArray(raw) ? raw : [])
    .slice(0, 40)
    .map((x) => (x ?? {}) as Record<string, unknown>)
    .filter((it) => String(it.name ?? "").trim() || it.catalog_id);
  if (!slots.length) return;

  const stmts: D1PreparedStatement[] = [];
  let pos = 0;

  const rowStmt = (
    groupKey: string,
    r: { catalog_id: string | null; name: string; norm_name: string },
    t: {
      target_sets: number | null;
      target_reps: string | null;
      target_rpe: number | null;
      notes: string | null;
    },
  ) =>
    env.DB.prepare(
      `INSERT INTO workout_template_items
         (id, template_id, catalog_id, name, norm_name, position, target_sets, target_reps, target_rpe, notes, group_key)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      genId(),
      templateId,
      r.catalog_id,
      r.name,
      r.norm_name,
      pos++,
      t.target_sets,
      t.target_reps,
      t.target_rpe,
      t.notes,
      groupKey,
    );

  for (const slot of slots) {
    const groupKey = genId();
    const primary = await resolveExercise(
      env,
      String(slot.name ?? ""),
      slot.catalog_id ? String(slot.catalog_id) : null,
    );
    stmts.push(
      rowStmt(groupKey, primary, {
        target_sets: optNum(slot.target_sets),
        target_reps: slot.target_reps ? String(slot.target_reps) : null,
        target_rpe: optNum(slot.target_rpe),
        notes: slot.notes ? String(slot.notes) : null,
      }),
    );
    const alts = Array.isArray(slot.alternatives) ? slot.alternatives.slice(0, 8) : [];
    for (const a of alts) {
      const ao = (a ?? {}) as Record<string, unknown>;
      if (!String(ao.name ?? "").trim() && !ao.catalog_id) continue;
      const r = await resolveExercise(
        env,
        String(ao.name ?? ""),
        ao.catalog_id ? String(ao.catalog_id) : null,
      );
      stmts.push(
        rowStmt(groupKey, r, {
          target_sets: null,
          target_reps: null,
          target_rpe: null,
          notes: null,
        }),
      );
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
}

workoutTemplates.get("/", async (c) => {
  return c.json({ templates: await allTemplates(c.env) });
});

workoutTemplates.post("/", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const name = String(b.name ?? "").trim();
  if (!name) return c.json({ error: "name required" }, 400);

  const id = genId();
  const now = nowIso();
  const posRow = await c.env.DB.prepare(
    "SELECT COALESCE(MAX(position), -1) AS m FROM workout_templates",
  ).first<{ m: number }>();
  await c.env.DB.prepare(
    "INSERT INTO workout_templates (id, name, description, position, created_at, updated_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(
      id,
      name,
      b.description ? String(b.description) : null,
      Number(posRow?.m ?? -1) + 1,
      now,
      now,
    )
    .run();
  await writeItems(c.env, id, b.items);
  return c.json(await templateWithItems(c.env, id));
});

workoutTemplates.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<Record<string, unknown>>();
  const fields: string[] = [];
  const vals: unknown[] = [];
  if (b.name !== undefined) {
    fields.push("name = ?");
    vals.push(String(b.name));
  }
  if (b.description !== undefined) {
    fields.push("description = ?");
    vals.push(b.description ? String(b.description) : null);
  }
  if (b.position !== undefined) {
    fields.push("position = ?");
    vals.push(Math.max(0, Math.round(num(b.position))));
  }
  if (b.archived !== undefined) {
    fields.push("archived = ?");
    vals.push(bool(b.archived) ? 1 : 0);
  }
  if (!fields.length) return c.json({ error: "nothing to update" }, 400);
  fields.push("updated_at = ?");
  vals.push(nowIso());
  vals.push(id);
  const res = await c.env.DB.prepare(
    `UPDATE workout_templates SET ${fields.join(", ")} WHERE id = ?`,
  )
    .bind(...vals)
    .run();
  if (!res.meta.changes) return c.json({ error: "not found" }, 404);
  return c.json(await templateWithItems(c.env, id));
});

// PUT /api/workout-templates/:id/items — replace the whole item list.
workoutTemplates.put("/:id/items", async (c) => {
  const id = c.req.param("id");
  const exists = await c.env.DB.prepare("SELECT id FROM workout_templates WHERE id = ?")
    .bind(id)
    .first();
  if (!exists) return c.json({ error: "not found" }, 404);
  const b = await c.req.json<{ items?: unknown }>();
  await c.env.DB.prepare("DELETE FROM workout_template_items WHERE template_id = ?")
    .bind(id)
    .run();
  await writeItems(c.env, id, b.items);
  await c.env.DB.prepare("UPDATE workout_templates SET updated_at = ? WHERE id = ?")
    .bind(nowIso(), id)
    .run();
  return c.json(await templateWithItems(c.env, id));
});

workoutTemplates.delete("/:id", async (c) => {
  const ok = await deleteTemplateCascade(c.env, c.req.param("id"));
  if (!ok) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});
