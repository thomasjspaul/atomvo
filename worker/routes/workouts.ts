import { Hono } from "hono";
import type { AppContext } from "../env";
import type { GymReportType } from "../../shared/types";
import {
  effectiveTimezone,
  genId,
  getSettings,
  nowIso,
  rolloverHour,
} from "../db";
import { addDays, todayTrackingDate, trackingDate } from "../time";
import { lbToKg } from "../nutrition";
import { bool, normalizeExerciseName, num, optNum, round1 } from "../util";
import {
  autoSessionTitle,
  deleteSessionCascade,
  enrichSessionExercise,
  pruneEmptyExercises,
  resolveExercise,
  seedSessionFromTemplate,
  sessionDetail,
  sessionSummaries,
} from "../gym";
import { buildGymReport, renderReportHtml } from "../gymReport";
import { MUSCLES } from "../ai";
import { sheetXlsx } from "../xlsx";
import { toCsv } from "../csv";

export const workouts = new Hono<AppContext>();

// Storing at full precision and letting each side round only for display
// (to its own unit's 0.1 step) is what makes the conversion round-trip
// cleanly. Rounding the kg value itself to 0.1 (round1) is coarser than the
// 0.1 lb the UI displays, so an imperial entry like 50 lb could round-trip
// back as 49.9 — do not reintroduce that.
function parseWeightKg(b: Record<string, unknown>, units: string): number | null {
  const kg = optNum(b.weight_kg);
  if (kg != null) return kg <= 0 ? null : kg;
  const disp = optNum(b.weight);
  if (disp == null || disp <= 0) return null;
  return units === "imperial" ? lbToKg(disp) : disp;
}

function clampRpe(v: number | null): number | null {
  if (v == null) return null;
  return Math.min(10, Math.max(1, Math.round(v * 2) / 2));
}

/** A YYYY-MM-DD tracking date no later than today, or null. */
function parseTrackingDate(raw: unknown, today: string): string | null {
  const v = String(raw ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) return null;
  return v > today ? today : v;
}

async function activeSessionId(env: AppContext["Bindings"]): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT id FROM workout_sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1",
  ).first<{ id: string }>();
  return row ? row.id : null;
}

// GET /api/workouts/active
workouts.get("/active", async (c) => {
  const id = await activeSessionId(c.env);
  return c.json({ session: id ? await sessionDetail(c.env, id) : null });
});

// GET /api/workouts?from=&to=&limit=
workouts.get("/", async (c) => {
  const sessions = await sessionSummaries(c.env, {
    from: c.req.query("from") || undefined,
    to: c.req.query("to") || undefined,
    limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
  });
  return c.json({ sessions });
});

// POST /api/workouts — start a session, or return the one already in progress.
workouts.post("/", async (c) => {
  const b = await c.req
    .json<Record<string, unknown>>()
    .catch(() => ({}) as Record<string, unknown>);

  const existing = await activeSessionId(c.env);
  if (existing) {
    return c.json({ session: await sessionDetail(c.env, existing), resumed: true });
  }

  const s = await getSettings(c.env);
  const now = nowIso();
  const id = genId();
  const gymId = b.gym_id ? String(b.gym_id) : null;
  const templateId = b.template_id ? String(b.template_id) : null;
  const today = trackingDate(new Date(now), effectiveTimezone(c.env, s), rolloverHour(c.env, s));
  // Logging a past workout: the session belongs to that day, not today.
  const date = parseTrackingDate(b.tracking_date, today) ?? today;
  await c.env.DB.prepare(
    `INSERT INTO workout_sessions
       (id, started_at, tracking_date, status, gym_id, template_id, title, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id,
      now,
      date,
      "active",
      gymId,
      templateId,
      b.title ? String(b.title) : null,
      now,
      now,
    )
    .run();
  if (templateId) await seedSessionFromTemplate(c.env, id, templateId);
  return c.json({ session: await sessionDetail(c.env, id), resumed: false });
});

// GET /api/workouts/exercise-search?q=&days=90 — per-exercise progress rows.
workouts.get("/exercise-search", async (c) => {
  const q = normalizeExerciseName(c.req.query("q") || "");
  const days = Math.min(730, Math.max(7, Number(c.req.query("days") || "90")));
  const s = await getSettings(c.env);
  const start = addDays(
    todayTrackingDate(effectiveTimezone(c.env, s), rolloverHour(c.env, s)),
    -(days - 1),
  );
  const like = `%${q}%`;
  const rows = await c.env.DB.prepare(
    `SELECT st.norm_name AS norm_name,
            COALESCE(MAX(ec.canonical_name), MAX(we.name), st.norm_name) AS canonical_name,
            MAX(st.catalog_id) AS catalog_id,
            MAX(s.tracking_date) AS last_done,
            COUNT(DISTINCT s.id) AS sessions,
            MAX(CASE WHEN st.is_warmup = 0 THEN st.weight_kg END) AS top_weight_kg,
            MAX(CASE WHEN st.is_warmup = 0 AND st.weight_kg IS NOT NULL AND st.reps IS NOT NULL
                     THEN st.weight_kg * (1 + st.reps / 30.0) END) AS top_est_1rm,
            COALESCE(SUM(CASE WHEN st.is_warmup = 0
                              THEN COALESCE(st.weight_kg, 0) * COALESCE(st.reps, 0) END), 0) AS total_volume_kg
       FROM workout_sets st
       JOIN workout_sessions s ON s.id = st.session_id AND s.status = 'finished'
       LEFT JOIN workout_exercises we ON we.id = st.workout_exercise_id
       LEFT JOIN exercise_catalog ec ON ec.id = st.catalog_id
      WHERE s.tracking_date >= ?
        AND (? = '' OR st.norm_name LIKE ? OR COALESCE(ec.canonical_name, we.name, '') LIKE ?)
      GROUP BY st.norm_name
      ORDER BY last_done DESC
      LIMIT 60`,
  )
    .bind(start, q, like, like)
    .all<Record<string, unknown>>();

  return c.json({
    results: rows.results.map((r) => ({
      norm_name: String(r.norm_name),
      canonical_name: String(r.canonical_name),
      catalog_id: r.catalog_id == null ? null : String(r.catalog_id),
      last_done: r.last_done == null ? null : String(r.last_done),
      sessions: Number(r.sessions ?? 0),
      top_weight_kg: r.top_weight_kg == null ? null : round1(Number(r.top_weight_kg)),
      top_est_1rm: r.top_est_1rm == null ? null : round1(Number(r.top_est_1rm)),
      total_volume_kg: Math.round(Number(r.total_volume_kg ?? 0)),
    })),
  });
});

// GET /api/workouts/progress?name=&catalog_id=&days=180 — one point per session.
workouts.get("/progress", async (c) => {
  const norm = normalizeExerciseName(c.req.query("name") || "");
  const catalogId = c.req.query("catalog_id") || "";
  const days = Math.min(730, Math.max(7, Number(c.req.query("days") || "180")));
  if (!norm && !catalogId) return c.json({ points: [] });
  const s = await getSettings(c.env);
  const start = addDays(
    todayTrackingDate(effectiveTimezone(c.env, s), rolloverHour(c.env, s)),
    -(days - 1),
  );
  const rows = await c.env.DB.prepare(
    `SELECT s.tracking_date AS date,
            MAX(CASE WHEN st.is_warmup = 0 THEN st.weight_kg END) AS top_weight_kg,
            MAX(CASE WHEN st.is_warmup = 0 AND st.weight_kg IS NOT NULL AND st.reps IS NOT NULL
                     THEN st.weight_kg * (1 + st.reps / 30.0) END) AS top_est_1rm,
            COALESCE(SUM(CASE WHEN st.is_warmup = 0
                              THEN COALESCE(st.weight_kg, 0) * COALESCE(st.reps, 0) END), 0) AS volume_kg,
            AVG(CASE WHEN st.is_warmup = 0 THEN st.rpe END) AS avg_rpe
       FROM workout_sets st
       JOIN workout_sessions s ON s.id = st.session_id AND s.status = 'finished'
      WHERE s.tracking_date >= ?
        AND (st.norm_name = ? OR (? != '' AND st.catalog_id = ?))
      GROUP BY s.tracking_date
      ORDER BY s.tracking_date`,
  )
    .bind(start, norm || " ", catalogId, catalogId)
    .all<Record<string, unknown>>();

  return c.json({
    points: rows.results.map((r) => ({
      date: String(r.date),
      top_weight_kg: r.top_weight_kg == null ? null : round1(Number(r.top_weight_kg)),
      top_est_1rm: r.top_est_1rm == null ? null : round1(Number(r.top_est_1rm)),
      volume_kg: Math.round(Number(r.volume_kg ?? 0)),
      avg_rpe: r.avg_rpe == null ? null : round1(Number(r.avg_rpe)),
    })),
  });
});

// GET /api/workouts/muscle-balance?days=30 — exercises + working sets per
// primary muscle across finished sessions, so neglected groups stand out.
workouts.get("/muscle-balance", async (c) => {
  const days = Math.min(730, Math.max(7, Number(c.req.query("days") || "30")));
  const s = await getSettings(c.env);
  const start = addDays(
    todayTrackingDate(effectiveTimezone(c.env, s), rolloverHour(c.env, s)),
    -(days - 1),
  );
  const rows = await c.env.DB.prepare(
    `SELECT COALESCE(ec.primary_muscle, '') AS muscle,
            COUNT(*) AS exercises,
            COALESCE(SUM((SELECT COUNT(*) FROM workout_sets st
                           WHERE st.workout_exercise_id = we.id AND st.is_warmup = 0)), 0) AS sets
       FROM workout_exercises we
       JOIN workout_sessions ws ON ws.id = we.session_id AND ws.status = 'finished'
       LEFT JOIN exercise_catalog ec ON ec.id = we.catalog_id
      WHERE ws.tracking_date >= ?
      GROUP BY muscle`,
  )
    .bind(start)
    .all<{ muscle: string; exercises: number; sets: number }>();
  const by = new Map(rows.results.map((r) => [r.muscle, r]));
  const get = (m: string) => ({
    exercises: Number(by.get(m)?.exercises ?? 0),
    sets: Number(by.get(m)?.sets ?? 0),
  });
  return c.json({
    days,
    muscles: MUSCLES.filter((m) => m !== "cardio").map((m) => ({ muscle: m, ...get(m) })),
    cardio: get("cardio"),
    // Exercises with no known muscle (free text logged before AI enrichment).
    unclassified: get(""),
  });
});

// GET /api/workouts/export?format=csv|xlsx|html&report=&from=&to=
workouts.get("/export", async (c) => {
  const format = (c.req.query("format") || "csv").toLowerCase();
  const reportRaw = c.req.query("report") || "sessions";
  const report = (
    ["sessions", "sets", "exercise_summary", "personal_records"].includes(reportRaw)
      ? reportRaw
      : "sessions"
  ) as GymReportType;
  const s = await getSettings(c.env);
  const today = todayTrackingDate(effectiveTimezone(c.env, s), rolloverHour(c.env, s));
  const to = c.req.query("to") || today;
  const from = c.req.query("from") || addDays(to, -89);

  const rep = await buildGymReport(c.env, {
    report,
    from,
    to,
    imperial: s.units === "imperial",
  });
  const base = `gym-${report}-${from}_${to}`;

  if (format === "xlsx") {
    return new Response(sheetXlsx(report, rep.headers, rep.rows), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      },
    });
  }
  if (format === "html") {
    return c.html(renderReportHtml(rep, { from, to }));
  }
  return new Response(toCsv(rep.headers, rep.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.csv"`,
    },
  });
});

// GET /api/workouts/:id
workouts.get("/:id", async (c) => {
  const session = await sessionDetail(c.env, c.req.param("id"));
  if (!session) return c.json({ error: "not found" }, 404);
  return c.json(session);
});

// PATCH /api/workouts/:id
workouts.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<Record<string, unknown>>();
  const fields: string[] = [];
  const vals: unknown[] = [];
  if (b.title !== undefined) {
    fields.push("title = ?");
    vals.push(b.title ? String(b.title) : null);
  }
  if (b.notes !== undefined) {
    fields.push("notes = ?");
    vals.push(b.notes ? String(b.notes) : null);
  }
  if (b.gym_id !== undefined) {
    fields.push("gym_id = ?");
    vals.push(b.gym_id ? String(b.gym_id) : null);
  }
  if (b.status !== undefined && ["active", "finished", "abandoned"].includes(String(b.status))) {
    fields.push("status = ?");
    vals.push(String(b.status));
    fields.push("ended_at = ?");
    vals.push(b.status === "active" ? null : nowIso());
  }
  let newDate: string | null = null;
  if (b.tracking_date !== undefined) {
    const s = await getSettings(c.env);
    newDate = parseTrackingDate(
      b.tracking_date,
      todayTrackingDate(effectiveTimezone(c.env, s), rolloverHour(c.env, s)),
    );
    if (!newDate) return c.json({ error: "invalid tracking_date" }, 400);
    fields.push("tracking_date = ?");
    vals.push(newDate);
  }
  if (!fields.length) return c.json({ error: "nothing to update" }, 400);
  fields.push("updated_at = ?");
  vals.push(nowIso());
  vals.push(id);
  const res = await c.env.DB.prepare(
    `UPDATE workout_sessions SET ${fields.join(", ")} WHERE id = ?`,
  )
    .bind(...vals)
    .run();
  if (!res.meta.changes) return c.json({ error: "not found" }, 404);
  if (newDate) {
    // tracking_date is denormalized onto sets for per-exercise history.
    await c.env.DB.prepare("UPDATE workout_sets SET tracking_date = ? WHERE session_id = ?")
      .bind(newDate, id)
      .run();
  }
  return c.json(await sessionDetail(c.env, id));
});

// POST /api/workouts/:id/finish
workouts.post("/:id/finish", async (c) => {
  const id = c.req.param("id");
  const now = nowIso();
  const sess = await c.env.DB.prepare(
    "SELECT template_id, title FROM workout_sessions WHERE id = ?",
  )
    .bind(id)
    .first<{ template_id: string | null; title: string | null }>();
  if (!sess) return c.json({ error: "not found" }, 404);

  // An exercise the user added but never logged a set for wasn't actually
  // performed — don't let it clutter the saved workout.
  await pruneEmptyExercises(c.env, id);

  // Name it from what was actually done ("Upper · Chest & back") unless the
  // user already gave it a name. Best-effort; never blocks finishing.
  const title =
    sess.title ?? (await autoSessionTitle(c.env, id, (await getSettings(c.env)).cohere_model));

  await c.env.DB.prepare(
    "UPDATE workout_sessions SET status = 'finished', ended_at = ?, title = ?, updated_at = ? WHERE id = ?",
  )
    .bind(now, title, now, id)
    .run();
  if (sess.template_id) {
    await c.env.DB.prepare(
      "UPDATE workout_templates SET use_count = use_count + 1, last_used_at = ? WHERE id = ?",
    )
      .bind(now, sess.template_id)
      .run();
  }
  return c.json(await sessionDetail(c.env, id));
});

// DELETE /api/workouts/:id
workouts.delete("/:id", async (c) => {
  const ok = await deleteSessionCascade(c.env, c.req.param("id"));
  if (!ok) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

// POST /api/workouts/:id/exercises
workouts.post("/:id/exercises", async (c) => {
  const sessionId = c.req.param("id");
  const found = await c.env.DB.prepare("SELECT id FROM workout_sessions WHERE id = ?")
    .bind(sessionId)
    .first();
  if (!found) return c.json({ error: "not found" }, 404);

  const b = await c.req.json<Record<string, unknown>>();
  if (!String(b.name ?? "").trim() && !b.catalog_id) {
    return c.json({ error: "name required" }, 400);
  }
  const resolved = await resolveExercise(
    c.env,
    String(b.name ?? ""),
    b.catalog_id ? String(b.catalog_id) : null,
  );
  const posRow = await c.env.DB.prepare(
    "SELECT COALESCE(MAX(position), -1) AS m FROM workout_exercises WHERE session_id = ?",
  )
    .bind(sessionId)
    .first<{ m: number }>();

  await c.env.DB.prepare(
    `INSERT INTO workout_exercises
       (id, session_id, catalog_id, name, norm_name, position, target_sets, target_reps, notes, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      genId(),
      sessionId,
      resolved.catalog_id,
      resolved.name,
      resolved.norm_name,
      Number(posRow?.m ?? -1) + 1,
      optNum(b.target_sets),
      b.target_reps ? String(b.target_reps) : null,
      b.notes ? String(b.notes) : null,
      nowIso(),
    )
    .run();
  return c.json(await sessionDetail(c.env, sessionId));
});

// POST /api/workouts/:id/exercises/:exId/enrich — AI description + muscle groups
// for this exercise if its catalog entry doesn't have them yet. Called by the
// client right after adding, so the add itself never waits on the AI.
workouts.post("/:id/exercises/:exId/enrich", async (c) => {
  const sessionId = c.req.param("id");
  const exId = c.req.param("exId");
  const ex = await c.env.DB.prepare(
    "SELECT id FROM workout_exercises WHERE id = ? AND session_id = ?",
  )
    .bind(exId, sessionId)
    .first();
  if (!ex) return c.json({ error: "not found" }, 404);
  const s = await getSettings(c.env);
  await enrichSessionExercise(c.env, exId, s.cohere_model);
  return c.json(await sessionDetail(c.env, sessionId));
});

// PATCH /api/workouts/:id/exercises/:exId
workouts.patch("/:id/exercises/:exId", async (c) => {
  const sessionId = c.req.param("id");
  const exId = c.req.param("exId");
  const ex = await c.env.DB.prepare(
    "SELECT * FROM workout_exercises WHERE id = ? AND session_id = ?",
  )
    .bind(exId, sessionId)
    .first<Record<string, unknown>>();
  if (!ex) return c.json({ error: "not found" }, 404);

  const b = await c.req.json<Record<string, unknown>>();
  const fields: string[] = [];
  const vals: unknown[] = [];
  if (b.position !== undefined) {
    fields.push("position = ?");
    vals.push(Math.max(0, Math.round(num(b.position))));
  }
  if (b.notes !== undefined) {
    fields.push("notes = ?");
    vals.push(b.notes ? String(b.notes) : null);
  }
  if (b.target_sets !== undefined) {
    fields.push("target_sets = ?");
    vals.push(optNum(b.target_sets));
  }
  if (b.target_reps !== undefined) {
    fields.push("target_reps = ?");
    vals.push(b.target_reps ? String(b.target_reps) : null);
  }

  let reResolved: Awaited<ReturnType<typeof resolveExercise>> | null = null;
  if (b.name !== undefined || b.catalog_id !== undefined) {
    reResolved = await resolveExercise(
      c.env,
      b.name !== undefined ? String(b.name) : String(ex.name),
      b.catalog_id !== undefined
        ? b.catalog_id
          ? String(b.catalog_id)
          : null
        : ex.catalog_id
          ? String(ex.catalog_id)
          : null,
    );
    fields.push("name = ?", "norm_name = ?", "catalog_id = ?");
    vals.push(reResolved.name, reResolved.norm_name, reResolved.catalog_id);
  }
  if (!fields.length) return c.json({ error: "nothing to update" }, 400);
  vals.push(exId);

  const stmts = [
    c.env.DB.prepare(
      `UPDATE workout_exercises SET ${fields.join(", ")} WHERE id = ?`,
    ).bind(...vals),
  ];
  if (reResolved) {
    stmts.push(
      c.env.DB.prepare(
        "UPDATE workout_sets SET norm_name = ?, catalog_id = ?, updated_at = ? WHERE workout_exercise_id = ?",
      ).bind(reResolved.norm_name, reResolved.catalog_id, nowIso(), exId),
    );
  }
  await c.env.DB.batch(stmts);
  return c.json(await sessionDetail(c.env, sessionId));
});

// DELETE /api/workouts/:id/exercises/:exId
workouts.delete("/:id/exercises/:exId", async (c) => {
  const sessionId = c.req.param("id");
  const exId = c.req.param("exId");
  const ex = await c.env.DB.prepare(
    "SELECT id FROM workout_exercises WHERE id = ? AND session_id = ?",
  )
    .bind(exId, sessionId)
    .first();
  if (!ex) return c.json({ error: "not found" }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM workout_sets WHERE workout_exercise_id = ?").bind(exId),
    c.env.DB.prepare("DELETE FROM workout_exercises WHERE id = ?").bind(exId),
  ]);
  return c.json(await sessionDetail(c.env, sessionId));
});

// POST /api/workouts/:id/exercises/:exId/sets
workouts.post("/:id/exercises/:exId/sets", async (c) => {
  const sessionId = c.req.param("id");
  const exId = c.req.param("exId");
  const ex = await c.env.DB.prepare(
    "SELECT catalog_id, norm_name FROM workout_exercises WHERE id = ? AND session_id = ?",
  )
    .bind(exId, sessionId)
    .first<{ catalog_id: string | null; norm_name: string }>();
  if (!ex) return c.json({ error: "not found" }, 404);

  const s = await getSettings(c.env);
  const b = await c.req
    .json<Record<string, unknown>>()
    .catch(() => ({}) as Record<string, unknown>);
  const sRow = await c.env.DB.prepare(
    "SELECT tracking_date FROM workout_sessions WHERE id = ?",
  )
    .bind(sessionId)
    .first<{ tracking_date: string }>();
  const cnt = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM workout_sets WHERE workout_exercise_id = ?",
  )
    .bind(exId)
    .first<{ n: number }>();

  const reps = optNum(b.reps);
  const now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO workout_sets
       (id, session_id, workout_exercise_id, catalog_id, norm_name, tracking_date,
        set_number, weight_kg, reps, rpe, is_warmup, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      genId(),
      sessionId,
      exId,
      ex.catalog_id,
      ex.norm_name,
      sRow?.tracking_date ??
        todayTrackingDate(effectiveTimezone(c.env, s), rolloverHour(c.env, s)),
      Number(cnt?.n ?? 0) + 1,
      parseWeightKg(b, s.units),
      reps == null ? null : Math.max(0, Math.round(reps)),
      clampRpe(optNum(b.rpe)),
      bool(b.is_warmup) ? 1 : 0,
      now,
      now,
    )
    .run();
  return c.json(await sessionDetail(c.env, sessionId));
});

// PATCH /api/workouts/:id/sets/:setId
workouts.patch("/:id/sets/:setId", async (c) => {
  const sessionId = c.req.param("id");
  const setId = c.req.param("setId");
  const found = await c.env.DB.prepare(
    "SELECT id FROM workout_sets WHERE id = ? AND session_id = ?",
  )
    .bind(setId, sessionId)
    .first();
  if (!found) return c.json({ error: "not found" }, 404);

  const s = await getSettings(c.env);
  const b = await c.req.json<Record<string, unknown>>();
  const fields: string[] = [];
  const vals: unknown[] = [];
  if (b.weight_kg !== undefined || b.weight !== undefined) {
    fields.push("weight_kg = ?");
    vals.push(parseWeightKg(b, s.units));
  }
  if (b.reps !== undefined) {
    const r = optNum(b.reps);
    fields.push("reps = ?");
    vals.push(r == null ? null : Math.max(0, Math.round(r)));
  }
  if (b.rpe !== undefined) {
    fields.push("rpe = ?");
    vals.push(clampRpe(optNum(b.rpe)));
  }
  if (b.is_warmup !== undefined) {
    fields.push("is_warmup = ?");
    vals.push(bool(b.is_warmup) ? 1 : 0);
  }
  if (!fields.length) return c.json({ error: "nothing to update" }, 400);
  fields.push("updated_at = ?");
  vals.push(nowIso());
  vals.push(setId);
  await c.env.DB.prepare(`UPDATE workout_sets SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...vals)
    .run();
  return c.json(await sessionDetail(c.env, sessionId));
});

// DELETE /api/workouts/:id/sets/:setId
workouts.delete("/:id/sets/:setId", async (c) => {
  const sessionId = c.req.param("id");
  const res = await c.env.DB.prepare(
    "DELETE FROM workout_sets WHERE id = ? AND session_id = ?",
  )
    .bind(c.req.param("setId"), sessionId)
    .run();
  if (!res.meta.changes) return c.json({ error: "not found" }, 404);
  return c.json(await sessionDetail(c.env, sessionId));
});
