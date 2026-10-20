// Cross-route logic for gym workout tracking. Keeps the route modules thin, the
// same way worker/service.ts does for meals/targets.

import type { Env } from "./env";
import type {
  ExerciseAlternative,
  ExerciseCatalogRef,
  ExercisePerformedSet,
  LastExercisePerformance,
  WorkoutExercise,
  WorkoutSet,
  WorkoutSessionDetail,
  WorkoutSessionSummary,
  WorkoutStatus,
  WorkoutTemplate,
  WorkoutTemplateItem,
} from "../shared/types";
import {
  genId,
  nowIso,
  rowToExerciseCatalogRef,
  rowToWorkoutSession,
  rowToWorkoutSet,
  rowToWorkoutTemplate,
  rowToWorkoutTemplateItem,
} from "./db";
import { addDays } from "./time";
import { enrichExercise, workoutTitle } from "./ai";
import { normalizeExerciseName, round1 } from "./util";

export function jsonStringArray(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** Parse an alt_json roster: JSON [{name, catalog_id}, ...]. */
function jsonAltRoster(raw: unknown): { name: string; catalog_id: string | null }[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => {
        const o = (x ?? {}) as Record<string, unknown>;
        return {
          name: String(o.name ?? "").trim(),
          catalog_id: o.catalog_id ? String(o.catalog_id) : null,
        };
      })
      .filter((x) => x.name);
  } catch {
    return [];
  }
}

/** Epley estimated 1-rep-max in kg. null when weight or reps are missing. */
export function est1RM(weightKg: number | null, reps: number | null): number | null {
  if (weightKg == null || reps == null || weightKg <= 0 || reps <= 0) return null;
  if (reps === 1) return round1(weightKg);
  return round1(weightKg * (1 + reps / 30));
}

export interface ResolvedExercise {
  catalog_id: string | null;
  name: string; // canonical name when resolved, else the trimmed input
  norm_name: string;
}

/**
 * Map a (possibly free-text) exercise name to the catalog. Uses the passed
 * catalog id first, then an exact normalized-name match, then an alias scan.
 */
export async function resolveExercise(
  env: Env,
  rawName: string,
  catalogId?: string | null,
): Promise<ResolvedExercise> {
  const typed = String(rawName ?? "").trim();

  if (catalogId) {
    const row = await env.DB.prepare(
      "SELECT id, canonical_name, norm_name FROM exercise_catalog WHERE id = ?",
    )
      .bind(catalogId)
      .first<Record<string, unknown>>();
    if (row) {
      return {
        catalog_id: String(row.id),
        name: String(row.canonical_name),
        norm_name: String(row.norm_name),
      };
    }
  }

  const norm = normalizeExerciseName(typed);
  if (norm) {
    const exact = await env.DB.prepare(
      "SELECT id, canonical_name, norm_name FROM exercise_catalog WHERE norm_name = ? LIMIT 1",
    )
      .bind(norm)
      .first<Record<string, unknown>>();
    if (exact) {
      return {
        catalog_id: String(exact.id),
        name: String(exact.canonical_name),
        norm_name: String(exact.norm_name),
      };
    }
    const alias = await env.DB.prepare(
      "SELECT id, canonical_name, norm_name FROM exercise_catalog WHERE aliases_json LIKE ? LIMIT 1",
    )
      .bind(`%"${norm}"%`)
      .first<Record<string, unknown>>();
    if (alias) {
      return {
        catalog_id: String(alias.id),
        name: String(alias.canonical_name),
        norm_name: String(alias.norm_name),
      };
    }
  }

  return { catalog_id: null, name: typed || "Exercise", norm_name: norm || "exercise" };
}

/**
 * The user's sets for this exercise in their most recent *prior finished*
 * session (strictly before `beforeDate`, so the in-progress session is excluded).
 */
export async function lastPerformance(
  env: Env,
  opts: {
    normName: string;
    catalogId: string | null;
    beforeDate: string;
    excludeSessionId?: string | null;
  },
): Promise<LastExercisePerformance | null> {
  const catId = opts.catalogId ?? null;
  const exclude = opts.excludeSessionId ?? null;

  const sess = await env.DB.prepare(
    `SELECT s.id AS id, s.tracking_date AS tracking_date
       FROM workout_sets st
       JOIN workout_sessions s ON s.id = st.session_id
      WHERE (st.norm_name = ? OR (? IS NOT NULL AND st.catalog_id = ?))
        AND s.status = 'finished'
        AND s.tracking_date < ?
        AND (? IS NULL OR s.id != ?)
      ORDER BY s.tracking_date DESC, s.started_at DESC
      LIMIT 1`,
  )
    .bind(opts.normName, catId, catId, opts.beforeDate, exclude, exclude)
    .first<{ id: string; tracking_date: string }>();
  if (!sess) return null;

  const setsRes = await env.DB.prepare(
    `SELECT set_number, weight_kg, reps, rpe, is_warmup
       FROM workout_sets
      WHERE session_id = ? AND (norm_name = ? OR (? IS NOT NULL AND catalog_id = ?))
      ORDER BY set_number`,
  )
    .bind(sess.id, opts.normName, catId, catId)
    .all<Record<string, unknown>>();

  const sets: ExercisePerformedSet[] = setsRes.results.map((r) => ({
    set_number: Number(r.set_number),
    weight_kg: r.weight_kg == null ? null : Number(r.weight_kg),
    reps: r.reps == null ? null : Number(r.reps),
    rpe: r.rpe == null ? null : Number(r.rpe),
    is_warmup: Number(r.is_warmup) === 1,
  }));

  let best: ExercisePerformedSet | null = null;
  let best1rm: number | null = null;
  for (const s of sets) {
    if (s.is_warmup) continue;
    const e = est1RM(s.weight_kg, s.reps);
    if (e != null && (best1rm == null || e > best1rm)) {
      best1rm = e;
      best = s;
    }
  }
  if (!best) {
    for (const s of sets) {
      if (s.is_warmup) continue;
      if (best == null || (s.weight_kg ?? -1) > (best.weight_kg ?? -1)) best = s;
    }
  }

  return {
    session_id: sess.id,
    tracking_date: sess.tracking_date,
    sets,
    best_set: best,
    est_1rm: best1rm,
  };
}

interface CatalogExtras {
  howto_query: string | null;
  alternatives: ExerciseCatalogRef[];
  description: string | null;
  primary_muscle: string | null;
  secondary_muscles: string[];
}

const NO_EXTRAS: CatalogExtras = {
  howto_query: null,
  alternatives: [],
  description: null,
  primary_muscle: null,
  secondary_muscles: [],
};

// Below this many curated alternatives, top up with same-primary-muscle
// exercises so "Swap exercise" always has something sensible to offer.
const MIN_ALTERNATIVES = 5;

async function catalogExtras(env: Env, catalogId: string | null): Promise<CatalogExtras> {
  if (!catalogId) return NO_EXTRAS;
  const row = await env.DB.prepare(
    `SELECT howto_query, alt_ids_json, description, primary_muscle, secondary_muscles_json
       FROM exercise_catalog WHERE id = ?`,
  )
    .bind(catalogId)
    .first<Record<string, unknown>>();
  if (!row) return NO_EXTRAS;
  const primary = row.primary_muscle == null ? null : String(row.primary_muscle);
  const base = {
    howto_query: row.howto_query == null ? null : String(row.howto_query),
    description: row.description == null ? null : String(row.description),
    primary_muscle: primary,
    secondary_muscles: jsonStringArray(row.secondary_muscles_json),
  };

  const altIds = jsonStringArray(row.alt_ids_json);
  let alternatives: ExerciseCatalogRef[] = [];
  if (altIds.length) {
    const alts = await env.DB.prepare(
      `SELECT id, canonical_name, primary_muscle, equipment
         FROM exercise_catalog WHERE id IN (${altIds.map(() => "?").join(",")})`,
    )
      .bind(...altIds)
      .all<Record<string, unknown>>();
    const byId = new Map(alts.results.map((r) => [String(r.id), rowToExerciseCatalogRef(r)]));
    alternatives = altIds
      .map((id) => byId.get(id))
      .filter((x): x is ExerciseCatalogRef => Boolean(x));
  }

  if (primary && primary !== "cardio" && alternatives.length < MIN_ALTERNATIVES) {
    const skip = [catalogId, ...alternatives.map((a) => a.id)];
    const more = await env.DB.prepare(
      `SELECT id, canonical_name, primary_muscle, equipment
         FROM exercise_catalog
        WHERE primary_muscle = ? AND id NOT IN (${skip.map(() => "?").join(",")})
        ORDER BY is_seed DESC, length(canonical_name)
        LIMIT ?`,
    )
      .bind(primary, ...skip, MIN_ALTERNATIVES - alternatives.length)
      .all<Record<string, unknown>>();
    alternatives = [...alternatives, ...more.results.map(rowToExerciseCatalogRef)];
  }
  return { ...base, alternatives };
}

/** Full nested session payload: exercises, their sets, "last time", how-to + alternatives. */
export async function sessionDetail(
  env: Env,
  sessionId: string,
): Promise<WorkoutSessionDetail | null> {
  const sRow = await env.DB.prepare(
    `SELECT ws.*, g.name AS gym_name
       FROM workout_sessions ws
       LEFT JOIN gyms g ON g.id = ws.gym_id
      WHERE ws.id = ?`,
  )
    .bind(sessionId)
    .first<Record<string, unknown>>();
  if (!sRow) return null;
  const session = rowToWorkoutSession(sRow);

  const [exRes, setRes] = await Promise.all([
    env.DB.prepare(
      "SELECT * FROM workout_exercises WHERE session_id = ? ORDER BY position, created_at",
    )
      .bind(sessionId)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT * FROM workout_sets WHERE session_id = ? ORDER BY workout_exercise_id, set_number",
    )
      .bind(sessionId)
      .all<Record<string, unknown>>(),
  ]);

  const setsByEx = new Map<string, WorkoutSet[]>();
  for (const r of setRes.results) {
    const set = rowToWorkoutSet(r);
    const arr = setsByEx.get(set.workout_exercise_id) ?? [];
    arr.push(set);
    setsByEx.set(set.workout_exercise_id, arr);
  }

  // Resolve catalog metadata for every plan-alternative in one query.
  const planAltIds = new Set<string>();
  for (const r of exRes.results)
    for (const a of jsonAltRoster(r.alt_json)) if (a.catalog_id) planAltIds.add(a.catalog_id);
  const altMeta = new Map<string, Record<string, unknown>>();
  if (planAltIds.size) {
    const ids = [...planAltIds];
    const rows = await env.DB.prepare(
      `SELECT id, canonical_name, primary_muscle, equipment
         FROM exercise_catalog WHERE id IN (${ids.map(() => "?").join(",")})`,
    )
      .bind(...ids)
      .all<Record<string, unknown>>();
    for (const row of rows.results) altMeta.set(String(row.id), row);
  }

  const exercises: WorkoutExercise[] = await Promise.all(
    exRes.results.map(async (r): Promise<WorkoutExercise> => {
      const exId = String(r.id);
      const catalogId = r.catalog_id == null ? null : String(r.catalog_id);
      const normName = String(r.norm_name);
      const [last, extra] = await Promise.all([
        lastPerformance(env, {
          normName,
          catalogId,
          beforeDate: addDays(session.tracking_date, 1),
          excludeSessionId: sessionId,
        }),
        catalogExtras(env, catalogId),
      ]);

      const planAlts: ExerciseAlternative[] = jsonAltRoster(r.alt_json)
        .filter((a) =>
          a.catalog_id
            ? a.catalog_id !== catalogId
            : normalizeExerciseName(a.name) !== normName,
        )
        .map((a) => {
          const meta = a.catalog_id ? altMeta.get(a.catalog_id) : undefined;
          return {
            name: meta ? String(meta.canonical_name) : a.name,
            catalog_id: a.catalog_id,
            primary_muscle: meta?.primary_muscle == null ? null : String(meta.primary_muscle),
            equipment: meta?.equipment == null ? null : String(meta.equipment),
            source: "plan" as const,
          };
        });
      const planIds = new Set(planAlts.map((p) => p.catalog_id).filter(Boolean));
      const catalogAlts: ExerciseAlternative[] = extra.alternatives
        .filter((c) => !planIds.has(c.id))
        .map((c) => ({
          name: c.canonical_name,
          catalog_id: c.id,
          primary_muscle: c.primary_muscle,
          equipment: c.equipment,
          source: "catalog" as const,
        }));

      return {
        id: exId,
        session_id: sessionId,
        catalog_id: catalogId,
        name: String(r.name),
        norm_name: normName,
        position: Number(r.position),
        target_sets: r.target_sets == null ? null : Number(r.target_sets),
        target_reps: r.target_reps == null ? null : String(r.target_reps),
        notes: r.notes == null ? null : String(r.notes),
        sets: setsByEx.get(exId) ?? [],
        last,
        howto_query: extra.howto_query,
        alternatives: [...planAlts, ...catalogAlts],
        description: extra.description,
        primary_muscle: extra.primary_muscle,
        secondary_muscles: extra.secondary_muscles,
      };
    }),
  );

  return { ...session, exercises };
}

/** Date-ranged session list with rolled-up counts/volume/RPE for history & Progress. */
export async function sessionSummaries(
  env: Env,
  opts: { from?: string; to?: string; limit?: number; statuses?: WorkoutStatus[] },
): Promise<WorkoutSessionSummary[]> {
  const conds: string[] = [];
  const binds: unknown[] = [];
  if (opts.from) {
    conds.push("ws.tracking_date >= ?");
    binds.push(opts.from);
  }
  if (opts.to) {
    conds.push("ws.tracking_date <= ?");
    binds.push(opts.to);
  }
  const statuses = opts.statuses ?? (["finished"] as WorkoutStatus[]);
  conds.push(`ws.status IN (${statuses.map(() => "?").join(",")})`);
  binds.push(...statuses);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 30));

  const rows = await env.DB.prepare(
    `SELECT ws.*, g.name AS gym_name,
            (SELECT COUNT(*) FROM workout_exercises we WHERE we.session_id = ws.id) AS exercise_count,
            (SELECT COUNT(*) FROM workout_sets st WHERE st.session_id = ws.id) AS set_count,
            (SELECT COALESCE(SUM(COALESCE(st.weight_kg, 0) * COALESCE(st.reps, 0)), 0)
               FROM workout_sets st WHERE st.session_id = ws.id AND st.is_warmup = 0) AS total_volume_kg,
            (SELECT AVG(st.rpe) FROM workout_sets st WHERE st.session_id = ws.id AND st.rpe IS NOT NULL) AS avg_rpe
       FROM workout_sessions ws
       LEFT JOIN gyms g ON g.id = ws.gym_id
      WHERE ${conds.join(" AND ")}
      ORDER BY ws.tracking_date DESC, ws.started_at DESC
      LIMIT ?`,
  )
    .bind(...binds, limit)
    .all<Record<string, unknown>>();

  return rows.results.map((r) => ({
    ...rowToWorkoutSession(r),
    exercise_count: Number(r.exercise_count ?? 0),
    set_count: Number(r.set_count ?? 0),
    total_volume_kg: Math.round(Number(r.total_volume_kg ?? 0)),
    avg_rpe: r.avg_rpe == null ? null : round1(Number(r.avg_rpe)),
  }));
}

// ---- templates ("baseline workouts") ---------------------------------

export async function allTemplates(env: Env): Promise<WorkoutTemplate[]> {
  const [tRes, iRes] = await Promise.all([
    env.DB.prepare(
      "SELECT * FROM workout_templates WHERE archived = 0 ORDER BY position, created_at",
    ).all<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT * FROM workout_template_items ORDER BY position",
    ).all<Record<string, unknown>>(),
  ]);
  const itemsByTemplate = new Map<string, WorkoutTemplateItem[]>();
  for (const r of iRes.results) {
    const it = rowToWorkoutTemplateItem(r);
    const arr = itemsByTemplate.get(it.template_id) ?? [];
    arr.push(it);
    itemsByTemplate.set(it.template_id, arr);
  }
  return tRes.results.map((r) =>
    rowToWorkoutTemplate(r, itemsByTemplate.get(String(r.id)) ?? []),
  );
}

export async function templateWithItems(
  env: Env,
  id: string,
): Promise<WorkoutTemplate | null> {
  const t = await env.DB.prepare("SELECT * FROM workout_templates WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!t) return null;
  const items = await env.DB.prepare(
    "SELECT * FROM workout_template_items WHERE template_id = ? ORDER BY position",
  )
    .bind(id)
    .all<Record<string, unknown>>();
  return rowToWorkoutTemplate(t, items.results.map(rowToWorkoutTemplateItem));
}

export async function deleteTemplateCascade(env: Env, id: string): Promise<boolean> {
  const exists = await env.DB.prepare("SELECT id FROM workout_templates WHERE id = ?")
    .bind(id)
    .first();
  if (!exists) return false;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM workout_template_items WHERE template_id = ?").bind(id),
    env.DB.prepare("DELETE FROM workout_templates WHERE id = ?").bind(id),
  ]);
  return true;
}

/** Copy a template's items into a fresh session as ordered exercises (no sets). */
export async function seedSessionFromTemplate(
  env: Env,
  sessionId: string,
  templateId: string,
): Promise<void> {
  const items = await env.DB.prepare(
    "SELECT * FROM workout_template_items WHERE template_id = ? ORDER BY position",
  )
    .bind(templateId)
    .all<Record<string, unknown>>();
  if (!items.results.length) return;

  // Group into slots by group_key (null = its own slot); primary = lowest position.
  const slots: Record<string, unknown>[][] = [];
  const byKey = new Map<string, Record<string, unknown>[]>();
  for (const r of items.results) {
    const key = r.group_key == null ? `solo:${String(r.id)}` : String(r.group_key);
    let arr = byKey.get(key);
    if (!arr) {
      arr = [];
      byKey.set(key, arr);
      slots.push(arr);
    }
    arr.push(r);
  }

  const now = nowIso();
  await env.DB.batch(
    slots.map((slot, i) => {
      const primary = slot[0];
      const roster = slot.map((g) => ({
        name: String(g.name),
        catalog_id: g.catalog_id == null ? null : String(g.catalog_id),
      }));
      return env.DB.prepare(
        `INSERT INTO workout_exercises
           (id, session_id, catalog_id, name, norm_name, position, target_sets, target_reps, notes, alt_json, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        genId(),
        sessionId,
        primary.catalog_id == null ? null : String(primary.catalog_id),
        String(primary.name),
        String(primary.norm_name),
        i,
        primary.target_sets == null ? null : Number(primary.target_sets),
        primary.target_reps == null ? null : String(primary.target_reps),
        primary.notes == null ? null : String(primary.notes),
        roster.length > 1 ? JSON.stringify(roster) : null,
        now,
      );
    }),
  );
}

/** Drop exercises that were added to a session but never got a logged set. */
export async function pruneEmptyExercises(env: Env, sessionId: string): Promise<void> {
  const empty = await env.DB.prepare(
    `SELECT we.id AS id FROM workout_exercises we
      WHERE we.session_id = ?
        AND NOT EXISTS (SELECT 1 FROM workout_sets st WHERE st.workout_exercise_id = we.id)`,
  )
    .bind(sessionId)
    .all<{ id: string }>();
  if (!empty.results.length) return;
  await env.DB.batch(
    empty.results.map((r) =>
      env.DB.prepare("DELETE FROM workout_exercises WHERE id = ?").bind(r.id),
    ),
  );
}

export async function deleteSessionCascade(env: Env, sessionId: string): Promise<boolean> {
  const exists = await env.DB.prepare("SELECT id FROM workout_sessions WHERE id = ?")
    .bind(sessionId)
    .first();
  if (!exists) return false;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM workout_sets WHERE session_id = ?").bind(sessionId),
    env.DB.prepare("DELETE FROM workout_exercises WHERE session_id = ?").bind(sessionId),
    env.DB.prepare("DELETE FROM workout_sessions WHERE id = ?").bind(sessionId),
  ]);
  return true;
}

// ---- AI enrichment ---------------------------------------------------

/**
 * Make sure a session exercise has a description + muscle groups. Catalog rows
 * missing a description get one filled in; a free-text exercise is adopted
 * into the catalog (is_seed=0) so its muscles are recorded and every past and
 * future log of the same name threads onto it. Returns true when anything changed.
 */
export async function enrichSessionExercise(
  env: Env,
  exId: string,
  model?: string,
): Promise<boolean> {
  const ex = await env.DB.prepare(
    "SELECT name, norm_name, catalog_id FROM workout_exercises WHERE id = ?",
  )
    .bind(exId)
    .first<{ name: string; norm_name: string; catalog_id: string | null }>();
  if (!ex) return false;

  if (ex.catalog_id) {
    const cat = await env.DB.prepare(
      "SELECT canonical_name, description FROM exercise_catalog WHERE id = ?",
    )
      .bind(ex.catalog_id)
      .first<{ canonical_name: string; description: string | null }>();
    if (!cat || cat.description) return false;
    const e = await enrichExercise(env, { name: cat.canonical_name, model });
    if (!e) return false;
    await env.DB.prepare(
      `UPDATE exercise_catalog
          SET description = ?, secondary_muscles_json = ?,
              primary_muscle = COALESCE(primary_muscle, ?)
        WHERE id = ?`,
    )
      .bind(
        e.description || null,
        JSON.stringify(e.secondary_muscles),
        e.primary_muscle,
        ex.catalog_id,
      )
      .run();
    return true;
  }

  const e = await enrichExercise(env, { name: ex.name, model });
  if (!e) return false;
  await env.DB.prepare(
    `INSERT INTO exercise_catalog
       (id, canonical_name, norm_name, primary_muscle, description, secondary_muscles_json, is_seed, created_at)
     VALUES (?,?,?,?,?,?,0,?)
     ON CONFLICT (norm_name) DO NOTHING`,
  )
    .bind(
      genId(),
      ex.name,
      ex.norm_name,
      e.primary_muscle,
      e.description || null,
      JSON.stringify(e.secondary_muscles),
      nowIso(),
    )
    .run();
  const row = await env.DB.prepare("SELECT id FROM exercise_catalog WHERE norm_name = ?")
    .bind(ex.norm_name)
    .first<{ id: string }>();
  if (!row) return false;
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE workout_exercises SET catalog_id = ? WHERE norm_name = ? AND catalog_id IS NULL",
    ).bind(row.id, ex.norm_name),
    env.DB.prepare(
      "UPDATE workout_sets SET catalog_id = ? WHERE norm_name = ? AND catalog_id IS NULL",
    ).bind(row.id, ex.norm_name),
  ]);
  return true;
}

const UPPER = new Set(["chest", "back", "shoulders", "biceps", "triceps", "forearms"]);
const LOWER = new Set(["quads", "hamstrings", "glutes", "calves"]);

/** Rule-based "Upper · Chest, back" title, used when the AI is unavailable. */
function fallbackTitle(exercises: { primary_muscle: string | null; sets: number }[]): string {
  const bySets = new Map<string, number>();
  for (const e of exercises) {
    if (!e.primary_muscle) continue;
    bySets.set(e.primary_muscle, (bySets.get(e.primary_muscle) ?? 0) + Math.max(1, e.sets));
  }
  if (!bySets.size) return "Workout";
  let upper = 0;
  let lower = 0;
  let cardio = 0;
  for (const [m, n] of bySets) {
    if (UPPER.has(m)) upper += n;
    else if (LOWER.has(m)) lower += n;
    else if (m === "cardio") cardio += n;
  }
  const total = [...bySets.values()].reduce((a, b) => a + b, 0);
  const split =
    cardio / total > 0.6
      ? "Cardio"
      : upper / total >= 0.7
        ? "Upper"
        : lower / total >= 0.7
          ? "Lower"
          : "Full body";
  const top = [...bySets.entries()]
    .filter(([m]) => m !== "cardio")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => m);
  if (!top.length) return split;
  const desc = top.join(", ");
  return `${split} · ${desc[0].toUpperCase()}${desc.slice(1)}`;
}

/** Title for a just-finished session: AI first, rule-based fallback. */
export async function autoSessionTitle(
  env: Env,
  sessionId: string,
  model?: string,
): Promise<string | null> {
  const rows = await env.DB.prepare(
    `SELECT COALESCE(ec.canonical_name, we.name) AS name, ec.primary_muscle AS primary_muscle,
            (SELECT COUNT(*) FROM workout_sets st
              WHERE st.workout_exercise_id = we.id AND st.is_warmup = 0) AS sets
       FROM workout_exercises we
       LEFT JOIN exercise_catalog ec ON ec.id = we.catalog_id
      WHERE we.session_id = ?
      ORDER BY we.position`,
  )
    .bind(sessionId)
    .all<Record<string, unknown>>();
  const exercises = rows.results.map((r) => ({
    name: String(r.name),
    primary_muscle: r.primary_muscle == null ? null : String(r.primary_muscle),
    sets: Number(r.sets ?? 0),
  }));
  if (!exercises.length) return null;
  return (await workoutTitle(env, { model, exercises })) ?? fallbackTitle(exercises);
}
