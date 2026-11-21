import { Hono } from "hono";
import type { AppContext } from "../env";
import type { ExerciseCleanupSuggestion, ExerciseRename, LoggedExercise } from "../../shared/types";
import { genId, getSettings, nowIso } from "../db";
import { normalizeExerciseName } from "../util";
import { resolveExercise } from "../gym";
import { suggestExerciseCleanup } from "../ai";

/**
 * Clean-up tool for inconsistently logged exercise names: list what's logged, ask the AI
 * for merges/renames, apply one (every row it changes is snapshotted), undo it.
 */
export const exerciseNames = new Hono<AppContext>();

type Env = AppContext["Bindings"];

async function loggedExercises(env: Env): Promise<LoggedExercise[]> {
  const rows = await env.DB.prepare(
    `SELECT we.norm_name AS norm_name,
            -- the most recent name it was logged under
            (SELECT we2.name FROM workout_exercises we2
               JOIN workout_sessions s2 ON s2.id = we2.session_id
              WHERE we2.norm_name = we.norm_name
              ORDER BY s2.started_at DESC LIMIT 1) AS name,
            MAX(we.catalog_id) AS catalog_id,
            COUNT(DISTINCT we.session_id) AS sessions,
            (SELECT COUNT(*) FROM workout_sets st WHERE st.norm_name = we.norm_name) AS sets,
            MIN(s.tracking_date) AS first_done,
            MAX(s.tracking_date) AS last_done
       FROM workout_exercises we
       JOIN workout_sessions s ON s.id = we.session_id
      GROUP BY we.norm_name
      ORDER BY we.norm_name`,
  ).all<Record<string, unknown>>();
  return rows.results.map((r) => ({
    norm_name: String(r.norm_name),
    name: String(r.name ?? r.norm_name),
    catalog_id: r.catalog_id == null ? null : String(r.catalog_id),
    sessions: Number(r.sessions ?? 0),
    sets: Number(r.sets ?? 0),
    first_done: String(r.first_done),
    last_done: String(r.last_done),
  }));
}

// GET /api/exercise-names — every logged exercise + recent renames (for undo).
exerciseNames.get("/", async (c) => {
  const [logged, renames] = await Promise.all([
    loggedExercises(c.env),
    c.env.DB.prepare(
      "SELECT id, created_at, from_json, to_name, undone_at FROM exercise_renames ORDER BY created_at DESC LIMIT 20",
    ).all<Record<string, unknown>>(),
  ]);
  return c.json({
    logged,
    renames: renames.results.map(
      (r): ExerciseRename => ({
        id: String(r.id),
        created_at: String(r.created_at),
        from: JSON.parse(String(r.from_json)) as string[],
        to_name: String(r.to_name),
        undone_at: r.undone_at == null ? null : String(r.undone_at),
      }),
    ),
  });
});

// POST /api/exercise-names/suggest — AI merge/rename suggestions (nothing is changed).
exerciseNames.post("/suggest", async (c) => {
  if (!c.env.COHERE_API_KEY) return c.json({ error: "AI isn't configured" }, 400);
  const [logged, s, cat] = await Promise.all([
    loggedExercises(c.env),
    getSettings(c.env),
    c.env.DB.prepare("SELECT canonical_name FROM exercise_catalog ORDER BY canonical_name").all<{
      canonical_name: string;
    }>(),
  ]);
  if (!logged.length) return c.json({ suggestions: [] });

  // The AI sees display names; map its answers back to norm_names.
  const byDisplay = new Map<string, LoggedExercise>();
  for (const l of logged) {
    byDisplay.set(l.name, l);
    byDisplay.set(l.norm_name, l);
    byDisplay.set(normalizeExerciseName(l.name), l);
  }
  let groups;
  try {
    groups = await suggestExerciseCleanup(c.env, {
      logged: logged.map((l) => ({ name: l.name, sessions: l.sessions })),
      catalog: cat.results.map((r) => r.canonical_name),
      model: s.cohere_model,
    });
  } catch (e) {
    return c.json({ error: `AI request failed: ${(e as Error).message.slice(0, 200)}` }, 502);
  }

  const used = new Set<string>();
  const suggestions: ExerciseCleanupSuggestion[] = [];
  for (const g of groups) {
    const members = [
      ...new Set(
        g.members
          .map((m) => byDisplay.get(m) ?? byDisplay.get(normalizeExerciseName(m)))
          .filter((l): l is LoggedExercise => Boolean(l))
          .map((l) => l.norm_name),
      ),
    ].filter((n) => !used.has(n));
    if (!members.length) continue;
    const target = await resolveExercise(c.env, g.name);
    const only = logged.find((l) => l.norm_name === members[0])!;
    // A one-name "group" that changes nothing visible is a no-op.
    if (members.length === 1 && target.norm_name === only.norm_name && target.name === only.name) continue;
    members.forEach((m) => used.add(m));
    suggestions.push({
      members,
      to_name: target.name,
      catalog_id: target.catalog_id,
      reason: g.reason,
    });
  }
  return c.json({ suggestions });
});

// POST /api/exercise-names/apply { from: norm_name[], to_name, catalog_id? }
exerciseNames.post("/apply", async (c) => {
  const b = await c.req.json<{ from?: unknown; to_name?: unknown; catalog_id?: unknown }>();
  const from = Array.isArray(b.from) ? [...new Set(b.from.map(String).filter(Boolean))] : [];
  const toName = String(b.to_name ?? "").trim();
  if (!from.length || !toName) return c.json({ error: "from and to_name required" }, 400);
  if (from.length > 50) return c.json({ error: "too many names" }, 400);

  const target = await resolveExercise(
    c.env,
    toName,
    typeof b.catalog_id === "string" ? b.catalog_id : null,
  );
  // Keep the user's exact wording unless it resolved to a catalog entry.
  const name = target.catalog_id ? target.name : toName;
  const norm = target.norm_name;
  const ph = from.map(() => "?").join(",");

  const [ex, sets, items, keyRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, name, norm_name, catalog_id FROM workout_exercises WHERE norm_name IN (${ph})`,
    )
      .bind(...from)
      .all<{ id: string; name: string; norm_name: string; catalog_id: string | null }>(),
    c.env.DB.prepare(`SELECT id, norm_name, catalog_id FROM workout_sets WHERE norm_name IN (${ph})`)
      .bind(...from)
      .all<{ id: string; norm_name: string; catalog_id: string | null }>(),
    c.env.DB.prepare(
      `SELECT id, name, norm_name, catalog_id FROM workout_template_items WHERE norm_name IN (${ph})`,
    )
      .bind(...from)
      .all<{ id: string; name: string; norm_name: string; catalog_id: string | null }>(),
    c.env.DB.prepare("SELECT key_lifts FROM settings WHERE id = 1").first<{ key_lifts: string | null }>(),
  ]);
  if (!ex.results.length && !sets.results.length) return c.json({ error: "nothing logged under those names" }, 404);

  // Key lifts: swap merged names for the new one.
  let keyLifts: string[] | null = null;
  try {
    const v = keyRow?.key_lifts ? JSON.parse(keyRow.key_lifts) : null;
    if (Array.isArray(v)) keyLifts = v.map(String);
  } catch {
    /* leave as is */
  }
  const newKeyLifts =
    keyLifts && keyLifts.some((k) => from.includes(k))
      ? [...new Set(keyLifts.map((k) => (from.includes(k) ? norm : k)))]
      : null;

  const snapshot = {
    exercises: ex.results.map((r) => [r.id, r.name, r.norm_name, r.catalog_id]),
    sets: sets.results.map((r) => [r.id, r.norm_name, r.catalog_id]),
    items: items.results.map((r) => [r.id, r.name, r.norm_name, r.catalog_id]),
    key_lifts: newKeyLifts ? keyLifts : undefined,
  };
  const id = genId();
  const stmts = [
    c.env.DB.prepare(
      `UPDATE workout_exercises SET name = ?, norm_name = ?, catalog_id = ? WHERE norm_name IN (${ph})`,
    ).bind(name, norm, target.catalog_id, ...from),
    c.env.DB.prepare(
      `UPDATE workout_sets SET norm_name = ?, catalog_id = ? WHERE norm_name IN (${ph})`,
    ).bind(norm, target.catalog_id, ...from),
    c.env.DB.prepare(
      `UPDATE workout_template_items SET name = ?, norm_name = ?, catalog_id = ? WHERE norm_name IN (${ph})`,
    ).bind(name, norm, target.catalog_id, ...from),
    c.env.DB.prepare(
      `INSERT INTO exercise_renames (id, created_at, from_json, to_name, to_norm_name, snapshot_json)
       VALUES (?,?,?,?,?,?)`,
    ).bind(id, nowIso(), JSON.stringify(from), name, norm, JSON.stringify(snapshot)),
  ];
  if (newKeyLifts) {
    stmts.push(
      c.env.DB.prepare("UPDATE settings SET key_lifts = ? WHERE id = 1").bind(JSON.stringify(newKeyLifts)),
    );
  }
  await c.env.DB.batch(stmts); // atomic
  return c.json({
    id,
    to_name: name,
    norm_name: norm,
    exercises: ex.results.length,
    sets: sets.results.length,
  });
});

// POST /api/exercise-names/:id/undo — put every snapshotted row back.
exerciseNames.post("/:id/undo", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM exercise_renames WHERE id = ?")
    .bind(c.req.param("id"))
    .first<Record<string, unknown>>();
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.undone_at) return c.json({ error: "already undone" }, 409);
  // Later changes may have touched the same rows, so undo strictly newest-first.
  const newer = await c.env.DB.prepare(
    "SELECT 1 FROM exercise_renames WHERE undone_at IS NULL AND created_at > ? LIMIT 1",
  )
    .bind(row.created_at)
    .first();
  if (newer) return c.json({ error: "Undo the newer change first." }, 409);
  const snap = JSON.parse(String(row.snapshot_json)) as {
    exercises: Array<[string, string, string, string | null]>;
    sets: Array<[string, string, string | null]>;
    items: Array<[string, string, string, string | null]>;
    key_lifts?: string[] | null;
  };
  const stmts = [
    ...snap.exercises.map(([id, name, norm, cat]) =>
      c.env.DB.prepare("UPDATE workout_exercises SET name = ?, norm_name = ?, catalog_id = ? WHERE id = ?").bind(
        name,
        norm,
        cat,
        id,
      ),
    ),
    ...snap.sets.map(([id, norm, cat]) =>
      c.env.DB.prepare("UPDATE workout_sets SET norm_name = ?, catalog_id = ? WHERE id = ?").bind(norm, cat, id),
    ),
    ...snap.items.map(([id, name, norm, cat]) =>
      c.env.DB.prepare(
        "UPDATE workout_template_items SET name = ?, norm_name = ?, catalog_id = ? WHERE id = ?",
      ).bind(name, norm, cat, id),
    ),
  ];
  if (snap.key_lifts !== undefined) {
    stmts.push(
      c.env.DB.prepare("UPDATE settings SET key_lifts = ? WHERE id = 1").bind(
        snap.key_lifts ? JSON.stringify(snap.key_lifts) : null,
      ),
    );
  }
  // Marked undone last: restoring is idempotent, so a retry after a partial failure is safe.
  stmts.push(c.env.DB.prepare("UPDATE exercise_renames SET undone_at = ? WHERE id = ?").bind(nowIso(), row.id));
  // Chunked to keep each batch a reasonable size.
  for (let i = 0; i < stmts.length; i += 90) await c.env.DB.batch(stmts.slice(i, i + 90));
  return c.json({ ok: true });
});
