import { Hono } from "hono";
import type { AppContext } from "../env";
import type {
  ExerciseCatalogRef,
  ExercisePickGroup,
  ExerciseSuggestion,
} from "../../shared/types";
import {
  effectiveTimezone,
  genId,
  getSettings,
  nowIso,
  rolloverHour,
  rowToExerciseCatalogEntry,
  rowToExerciseCatalogRef,
} from "../db";
import { addDays, todayTrackingDate } from "../time";
import { normalizeExerciseName } from "../util";
import { jsonStringArray, lastPerformance } from "../gym";
import { MUSCLES, suggestExercises, type ExerciseSuggestionAI } from "../ai";

export const exercises = new Hono<AppContext>();

const SUGGEST_TTL_MS = 30 * 86_400_000;

async function catalogSearch(
  env: AppContext["Bindings"],
  norm: string,
  limit: number,
): Promise<ExerciseSuggestion[]> {
  const rows = await env.DB.prepare(
    `SELECT id, canonical_name, norm_name, primary_muscle, equipment
       FROM exercise_catalog
      WHERE norm_name LIKE ? OR aliases_json LIKE ?
      ORDER BY
        CASE
          WHEN norm_name = ? THEN 0
          WHEN norm_name LIKE ? THEN 1
          WHEN norm_name LIKE ? THEN 2
          ELSE 3
        END,
        is_seed DESC,
        length(canonical_name)
      LIMIT ?`,
  )
    .bind(`%${norm}%`, `%${norm}%`, norm, `${norm}%`, `%${norm}%`, limit)
    .all<Record<string, unknown>>();
  return rows.results.map((r) => ({
    catalog_id: String(r.id),
    canonical_name: String(r.canonical_name),
    primary_muscle: r.primary_muscle == null ? null : String(r.primary_muscle),
    equipment: r.equipment == null ? null : String(r.equipment),
    from_ai: false,
  }));
}

/** AI names → suggestions, adopting an existing catalog row where the name already matches. */
async function resolveAiSuggestions(
  env: AppContext["Bindings"],
  aiRaw: ExerciseSuggestionAI[],
): Promise<ExerciseSuggestion[]> {
  if (!aiRaw.length) return [];
  const norms = [...new Set(aiRaw.map((a) => normalizeExerciseName(a.canonical_name)))].filter(
    Boolean,
  );
  const byNorm = new Map<string, Record<string, unknown>>();
  if (norms.length) {
    const rows = await env.DB.prepare(
      `SELECT id, canonical_name, norm_name, primary_muscle, equipment
         FROM exercise_catalog WHERE norm_name IN (${norms.map(() => "?").join(",")})`,
    )
      .bind(...norms)
      .all<Record<string, unknown>>();
    for (const r of rows.results) byNorm.set(String(r.norm_name), r);
  }
  const out: ExerciseSuggestion[] = [];
  const seen = new Set<string>();
  for (const a of aiRaw) {
    const norm = normalizeExerciseName(a.canonical_name);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    const hit = byNorm.get(norm);
    out.push(
      hit
        ? {
            catalog_id: String(hit.id),
            canonical_name: String(hit.canonical_name),
            primary_muscle: hit.primary_muscle == null ? null : String(hit.primary_muscle),
            equipment: hit.equipment == null ? null : String(hit.equipment),
            from_ai: false,
          }
        : {
            catalog_id: null,
            canonical_name: a.canonical_name,
            primary_muscle: a.primary_muscle,
            equipment: a.equipment,
            from_ai: true,
            alternatives: a.alternatives,
          },
    );
  }
  return out;
}

/** Cohere suggestions behind exercise_suggest_cache (hits and misses, 30-day TTL). */
async function cachedAiSuggestions(
  env: AppContext["Bindings"],
  opts: { cacheKey: string; query: string; known: string[]; limit: number; muscle?: boolean },
): Promise<ExerciseSuggestion[]> {
  const cached = await env.DB.prepare(
    "SELECT found, payload, fetched_at FROM exercise_suggest_cache WHERE query = ?",
  )
    .bind(opts.cacheKey)
    .first<{ found: number; payload: string | null; fetched_at: string }>();
  if (cached && Date.now() - Date.parse(cached.fetched_at) < SUGGEST_TTL_MS) {
    return cached.found && cached.payload
      ? (JSON.parse(cached.payload) as ExerciseSuggestion[])
      : [];
  }
  const s = await getSettings(env);
  const aiRaw = await suggestExercises(env, {
    query: opts.query,
    known: opts.known,
    model: s.cohere_model,
    limit: opts.limit,
    muscle: opts.muscle,
  });
  const ai = await resolveAiSuggestions(env, aiRaw);
  await env.DB.prepare(
    `INSERT INTO exercise_suggest_cache (query, found, payload, fetched_at) VALUES (?,?,?,?)
     ON CONFLICT (query) DO UPDATE SET found = excluded.found, payload = excluded.payload, fetched_at = excluded.fetched_at`,
  )
    .bind(opts.cacheKey, ai.length ? 1 : 0, ai.length ? JSON.stringify(ai) : null, nowIso())
    .run();
  return ai;
}

function rowToSuggestion(r: Record<string, unknown>): ExerciseSuggestion {
  return {
    catalog_id: r.catalog_id == null ? null : String(r.catalog_id),
    canonical_name: String(r.display_name),
    primary_muscle: r.primary_muscle == null ? null : String(r.primary_muscle),
    equipment: r.equipment == null ? null : String(r.equipment),
    from_ai: false,
  };
}

// GET /api/exercises?q=&limit=8 — seeded catalog first, Cohere fills the gap (cached).
exercises.get("/", async (c) => {
  const q = (c.req.query("q") || "").trim();
  const limit = Math.min(20, Math.max(1, Number(c.req.query("limit") || "8")));
  const norm = normalizeExerciseName(q);
  if (norm.length < 2) return c.json({ suggestions: [], source: "catalog" });

  const catalog = await catalogSearch(c.env, norm, limit);
  // The AI round trip is the slow part of this search (a Cohere call when
  // uncached) — only pay for it when the local catalog genuinely came up
  // short, not just short of a full page of `limit` results.
  const AI_TRIGGER_MAX = Math.min(3, limit);
  if (catalog.length >= AI_TRIGGER_MAX || !c.env.COHERE_API_KEY) {
    return c.json({ suggestions: catalog, source: "catalog" });
  }

  const ai = await cachedAiSuggestions(c.env, {
    cacheKey: norm,
    query: q,
    known: catalog.map((x) => x.canonical_name),
    limit,
  });

  const seen = new Set(catalog.map((x) => x.canonical_name.toLowerCase()));
  const merged = [...catalog];
  for (const s of ai) {
    if (merged.length >= limit) break;
    const key = s.canonical_name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(s);
  }
  const source =
    catalog.length === 0
      ? ai.length
        ? "ai"
        : "catalog"
      : ai.length
        ? "mixed"
        : "catalog";
  return c.json({ suggestions: merged, source });
});

// GET /api/exercises/recent?limit=12 — distinct exercises by most recent use.
exercises.get("/recent", async (c) => {
  const limit = Math.min(30, Math.max(1, Number(c.req.query("limit") || "12")));
  const rows = await c.env.DB.prepare(
    `SELECT we.norm_name AS norm_name,
            we.catalog_id AS catalog_id,
            COALESCE(ec.canonical_name, we.name) AS display_name,
            ec.primary_muscle AS primary_muscle,
            ec.equipment AS equipment,
            MAX(s.started_at) AS last_at
       FROM workout_exercises we
       JOIN workout_sessions s ON s.id = we.session_id
       LEFT JOIN exercise_catalog ec ON ec.id = we.catalog_id
      GROUP BY we.norm_name
      ORDER BY last_at DESC
      LIMIT ?`,
  )
    .bind(limit)
    .all<Record<string, unknown>>();

  return c.json({ exercises: rows.results.map(rowToSuggestion) });
});

// GET /api/exercises/pick-groups?sessions=10 — quick-pick sources for the
// add-exercise sheet: every saved (baseline) workout, then recent sessions.
exercises.get("/pick-groups", async (c) => {
  const nSessions = Math.min(30, Math.max(1, Number(c.req.query("sessions") || "10")));
  const [tRes, sRes] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, name FROM workout_templates WHERE archived = 0 ORDER BY position, created_at",
    ).all<{ id: string; name: string }>(),
    c.env.DB.prepare(
      `SELECT id, title, tracking_date FROM workout_sessions
        WHERE status = 'finished'
        ORDER BY tracking_date DESC, started_at DESC
        LIMIT ?`,
    )
      .bind(nSessions)
      .all<{ id: string; title: string | null; tracking_date: string }>(),
  ]);

  const tIds = tRes.results.map((t) => t.id);
  const sIds = sRes.results.map((x) => x.id);
  const none = { results: [] as Record<string, unknown>[] };
  const [tItems, sItems] = await Promise.all([
    tIds.length
      ? c.env.DB.prepare(
          `SELECT ti.template_id AS owner, ti.catalog_id AS catalog_id,
                  COALESCE(ec.canonical_name, ti.name) AS display_name,
                  ec.primary_muscle AS primary_muscle, ec.equipment AS equipment
             FROM workout_template_items ti
             LEFT JOIN exercise_catalog ec ON ec.id = ti.catalog_id
            WHERE ti.template_id IN (${tIds.map(() => "?").join(",")})
            ORDER BY ti.position`,
        )
          .bind(...tIds)
          .all<Record<string, unknown>>()
      : none,
    sIds.length
      ? c.env.DB.prepare(
          `SELECT we.session_id AS owner, we.catalog_id AS catalog_id,
                  COALESCE(ec.canonical_name, we.name) AS display_name,
                  ec.primary_muscle AS primary_muscle, ec.equipment AS equipment
             FROM workout_exercises we
             LEFT JOIN exercise_catalog ec ON ec.id = we.catalog_id
            WHERE we.session_id IN (${sIds.map(() => "?").join(",")})
            ORDER BY we.position, we.created_at`,
        )
          .bind(...sIds)
          .all<Record<string, unknown>>()
      : none,
  ]);

  const byOwner = new Map<string, ExerciseSuggestion[]>();
  for (const r of [...tItems.results, ...sItems.results]) {
    const owner = String(r.owner);
    const arr = byOwner.get(owner) ?? [];
    const sug = rowToSuggestion(r);
    if (!arr.some((x) => x.canonical_name === sug.canonical_name)) arr.push(sug);
    byOwner.set(owner, arr);
  }

  const groups: ExercisePickGroup[] = [
    ...tRes.results.map((t) => ({
      kind: "template" as const,
      id: t.id,
      label: t.name,
      tracking_date: null,
      exercises: byOwner.get(t.id) ?? [],
    })),
    ...sRes.results.map((x) => ({
      kind: "session" as const,
      id: x.id,
      label: x.title || "Workout",
      tracking_date: x.tracking_date,
      exercises: byOwner.get(x.id) ?? [],
    })),
  ].filter((g) => g.exercises.length > 0);
  return c.json({ groups });
});

// GET /api/exercises/by-muscle?muscle=chest — exercises for one muscle group:
// the ones already done first (most recent first), then the catalog, then AI ideas.
exercises.get("/by-muscle", async (c) => {
  const muscle = (c.req.query("muscle") || "").trim().toLowerCase();
  if (!(MUSCLES as readonly string[]).includes(muscle)) {
    return c.json({ suggestions: [], source: "catalog" });
  }
  const rows = await c.env.DB.prepare(
    `SELECT ec.id AS catalog_id, ec.canonical_name AS display_name,
            ec.primary_muscle AS primary_muscle, ec.equipment AS equipment,
            (SELECT MAX(s.tracking_date) FROM workout_exercises we
               JOIN workout_sessions s ON s.id = we.session_id
              WHERE we.catalog_id = ec.id) AS last_done
       FROM exercise_catalog ec
      WHERE ec.primary_muscle = ?
      ORDER BY last_done IS NULL, last_done DESC, ec.is_seed DESC, length(ec.canonical_name)
      LIMIT 30`,
  )
    .bind(muscle)
    .all<Record<string, unknown>>();
  const catalog = rows.results.map(rowToSuggestion);

  const ai = c.env.COHERE_API_KEY
    ? await cachedAiSuggestions(c.env, {
        cacheKey: `muscle:${muscle}`,
        query: muscle,
        known: catalog.map((x) => x.canonical_name),
        limit: 10,
        muscle: true,
      })
    : [];
  const seen = new Set(catalog.map((x) => x.canonical_name.toLowerCase()));
  const extra = ai.filter((x) => !seen.has(x.canonical_name.toLowerCase()));
  return c.json({
    suggestions: [...catalog, ...extra],
    source: extra.length ? (catalog.length ? "mixed" : "ai") : "catalog",
  });
});

// GET /api/exercises/history?name=&catalog_id= — "what did I do last time".
exercises.get("/history", async (c) => {
  const name = (c.req.query("name") || "").trim();
  const catalogId = c.req.query("catalog_id") || null;
  const norm = normalizeExerciseName(name);
  if (!norm && !catalogId) return c.json({ last: null });

  const s = await getSettings(c.env);
  const today = todayTrackingDate(effectiveTimezone(c.env, s), rolloverHour(c.env, s));
  const last = await lastPerformance(c.env, {
    normName: norm || " ",
    catalogId,
    beforeDate: addDays(today, 1),
  });
  return c.json({ last });
});

// GET /api/exercises/:id — one catalog entry with resolved alternatives.
exercises.get("/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM exercise_catalog WHERE id = ?")
    .bind(c.req.param("id"))
    .first<Record<string, unknown>>();
  if (!row) return c.json({ error: "not found" }, 404);

  const altIds = jsonStringArray(row.alt_ids_json);
  let alternatives: ExerciseCatalogRef[] = [];
  if (altIds.length) {
    const alts = await c.env.DB.prepare(
      `SELECT id, canonical_name, primary_muscle, equipment
         FROM exercise_catalog WHERE id IN (${altIds.map(() => "?").join(",")})`,
    )
      .bind(...altIds)
      .all<Record<string, unknown>>();
    const byId = new Map(alts.results.map((r) => [String(r.id), rowToExerciseCatalogRef(r)]));
    alternatives = altIds
      .map((i) => byId.get(i))
      .filter((x): x is ExerciseCatalogRef => Boolean(x));
  }
  return c.json(rowToExerciseCatalogEntry(row, alternatives));
});

// POST /api/exercises — canonicalise-on-select: adopt a picked name into the
// catalog (is_seed=0) so it's found locally next time. Upsert on norm_name.
exercises.post("/", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const canonical = String(b.canonical_name ?? "").trim();
  if (!canonical) return c.json({ error: "canonical_name required" }, 400);
  const norm = normalizeExerciseName(canonical);
  if (!norm) return c.json({ error: "canonical_name required" }, 400);

  const existing = await c.env.DB.prepare("SELECT * FROM exercise_catalog WHERE norm_name = ?")
    .bind(norm)
    .first<Record<string, unknown>>();
  if (existing) return c.json(rowToExerciseCatalogEntry(existing, []));

  const id = genId();
  const aliases =
    Array.isArray(b.aliases) && b.aliases.length
      ? JSON.stringify((b.aliases as unknown[]).map(String))
      : null;

  // Resolve any supplied alternative names to existing catalog ids.
  let altIdsJson: string | null = null;
  if (Array.isArray(b.alternatives) && b.alternatives.length) {
    const altNorms = [
      ...new Set((b.alternatives as unknown[]).map((x) => normalizeExerciseName(String(x)))),
    ].filter((n) => n && n !== norm);
    if (altNorms.length) {
      const rows = await c.env.DB.prepare(
        `SELECT id FROM exercise_catalog WHERE norm_name IN (${altNorms.map(() => "?").join(",")})`,
      )
        .bind(...altNorms)
        .all<{ id: string }>();
      if (rows.results.length) altIdsJson = JSON.stringify(rows.results.map((r) => String(r.id)));
    }
  }

  await c.env.DB.prepare(
    `INSERT INTO exercise_catalog
       (id, canonical_name, norm_name, aliases_json, primary_muscle, equipment, category, howto_query, alt_ids_json, is_seed, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,0,?)`,
  )
    .bind(
      id,
      canonical,
      norm,
      aliases,
      b.primary_muscle ? String(b.primary_muscle) : null,
      b.equipment ? String(b.equipment) : null,
      b.category ? String(b.category) : null,
      b.howto_query ? String(b.howto_query) : null,
      altIdsJson,
      nowIso(),
    )
    .run();

  const entry = await c.env.DB.prepare("SELECT * FROM exercise_catalog WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  const altIds = jsonStringArray(entry!.alt_ids_json);
  let alternatives: ExerciseCatalogRef[] = [];
  if (altIds.length) {
    const alts = await c.env.DB.prepare(
      `SELECT id, canonical_name, primary_muscle, equipment
         FROM exercise_catalog WHERE id IN (${altIds.map(() => "?").join(",")})`,
    )
      .bind(...altIds)
      .all<Record<string, unknown>>();
    const byId = new Map(alts.results.map((r) => [String(r.id), rowToExerciseCatalogRef(r)]));
    alternatives = altIds
      .map((i) => byId.get(i))
      .filter((x): x is ExerciseCatalogRef => Boolean(x));
  }
  return c.json(rowToExerciseCatalogEntry(entry!, alternatives));
});
