-- Gym workout tracking. Green-field: no overlap with whoop_data (that's wrist-strap
-- cardio/strain). Sessions are logged set-by-set during a workout; exactly one
-- session is 'active' at a time (enforced in code). Exercise identity is the
-- normalized name (norm_name) so free-text entries still thread into history;
-- catalog_id is a secondary match when the exercise resolves to the dictionary.
-- No FK constraints (codebase convention) — cascade deletes are done in code.

CREATE TABLE gyms (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  location   TEXT,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Canonical exercise dictionary. Seeded rows is_seed=1; AI/user-added rows is_seed=0.
CREATE TABLE exercise_catalog (
  id             TEXT PRIMARY KEY,        -- seed rows use fixed ids ('seed_barbell_bench_press')
  canonical_name TEXT NOT NULL,
  norm_name      TEXT NOT NULL,           -- normalizeExerciseName(canonical_name)
  aliases_json   TEXT,                    -- JSON string[]
  primary_muscle TEXT,                    -- chest|back|quads|hamstrings|glutes|shoulders|biceps|triceps|core|calves
  equipment      TEXT,                    -- barbell|dumbbell|machine|cable|bodyweight|kettlebell|smith
  category       TEXT,                    -- compound|isolation|cardio
  howto_query    TEXT,                    -- optional override for the how-to search text; else canonical_name
  alt_ids_json   TEXT,                    -- JSON string[] of exercise_catalog.id
  is_seed        INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX idx_exercise_catalog_norm ON exercise_catalog (norm_name);
CREATE INDEX idx_exercise_catalog_muscle ON exercise_catalog (primary_muscle);

-- One gym session. Exactly one status='active' at a time (code-enforced).
CREATE TABLE workout_sessions (
  id            TEXT PRIMARY KEY,
  started_at    TEXT NOT NULL,
  ended_at      TEXT,
  tracking_date TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',   -- active|finished|abandoned
  gym_id        TEXT,                             -- soft ref
  template_id   TEXT,                             -- soft ref
  title         TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_workout_sessions_tracking_date ON workout_sessions (tracking_date);
CREATE INDEX idx_workout_sessions_status ON workout_sessions (status);

-- Ordered exercise instances within a session.
CREATE TABLE workout_exercises (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,             -- soft ref
  catalog_id  TEXT,                      -- soft ref; null = pure free-text
  name        TEXT NOT NULL,
  norm_name   TEXT NOT NULL,             -- durable key for "last time"
  position    INTEGER NOT NULL DEFAULT 0,
  target_sets INTEGER,
  target_reps TEXT,                      -- "8-12"
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_workout_exercises_session ON workout_exercises (session_id);
CREATE INDEX idx_workout_exercises_norm ON workout_exercises (norm_name);

-- Individual sets. session_id/catalog_id/norm_name/tracking_date denormalized so
-- per-exercise history is one indexed query, no joins (matches entries/weights style).
CREATE TABLE workout_sets (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL,
  workout_exercise_id TEXT NOT NULL,
  catalog_id          TEXT,
  norm_name           TEXT NOT NULL,
  tracking_date       TEXT NOT NULL,
  set_number          INTEGER NOT NULL DEFAULT 1,
  weight_kg           REAL,               -- null = bodyweight
  reps                INTEGER,
  rpe                 REAL,               -- 1..10, 0.5 steps, nullable
  is_warmup           INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_workout_sets_exercise ON workout_sets (workout_exercise_id);
CREATE INDEX idx_workout_sets_norm_date ON workout_sets (norm_name, tracking_date);
CREATE INDEX idx_workout_sets_session ON workout_sets (session_id);

-- "Baseline workouts" = reusable templates (surfaced on the Memory page).
CREATE TABLE workout_templates (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  archived     INTEGER NOT NULL DEFAULT 0,
  use_count    INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE workout_template_items (
  id          TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,             -- soft ref
  catalog_id  TEXT,                      -- soft ref, nullable
  name        TEXT NOT NULL,
  norm_name   TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  target_sets INTEGER,
  target_reps TEXT,
  target_rpe  REAL,
  notes       TEXT
);
CREATE INDEX idx_workout_template_items_template ON workout_template_items (template_id);

-- AI exercise-autocomplete cache. Mirrors barcode_cache: caches hits AND misses, TTL in code.
CREATE TABLE exercise_suggest_cache (
  query      TEXT PRIMARY KEY,           -- normalized query string
  found      INTEGER NOT NULL,
  payload    TEXT,                       -- JSON ExerciseSuggestion[]; null when found=0
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Scalar pointer only; the gym list is its own table.
ALTER TABLE settings ADD COLUMN current_gym_id TEXT;
