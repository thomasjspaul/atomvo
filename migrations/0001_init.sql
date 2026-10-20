-- Fuel — initial schema
-- Conventions:
--   * timestamps: TEXT, ISO-8601 UTC (e.g. 2026-08-30T14:03:00.000Z)
--   * tracking_date: TEXT, 'YYYY-MM-DD' in APP_TIMEZONE after the 3 AM rollover
--   * booleans: INTEGER 0/1
--   * body measurements stored SI (kg, cm); imperial is a display concern
--   * JSON blobs stored as TEXT

PRAGMA foreign_keys = ON;

-- Single-row app configuration (id is always 1).
CREATE TABLE settings (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  timezone           TEXT    NOT NULL DEFAULT 'America/Halifax',
  day_rollover_hour  INTEGER NOT NULL DEFAULT 3,
  units              TEXT    NOT NULL DEFAULT 'imperial',      -- 'imperial' | 'metric'
  sex                TEXT,                                     -- 'male' | 'female'
  birthdate          TEXT,                                     -- 'YYYY-MM-DD'
  height_cm          REAL,
  activity_multiplier REAL   NOT NULL DEFAULT 1.5,
  goal               TEXT    NOT NULL DEFAULT 'muscle_gain',   -- 'muscle_gain' | 'recomp'
  surplus_kcal       INTEGER NOT NULL DEFAULT 150,
  protein_g_per_kg   REAL    NOT NULL DEFAULT 2.0,
  bmr_source         TEXT    NOT NULL DEFAULT 'mifflin',       -- 'mifflin' | 'scale'
  adaptive_enabled   INTEGER NOT NULL DEFAULT 1,
  openai_model       TEXT    NOT NULL DEFAULT 'gpt-4o',
  coach_style        TEXT    NOT NULL DEFAULT 'balanced',      -- 'brief' | 'balanced' | 'detailed'
  focus_mode         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO settings (id) VALUES (1);

-- One logged meal / snack / drink.
CREATE TABLE entries (
  id               TEXT PRIMARY KEY,
  occurred_at      TEXT NOT NULL,
  tracking_date    TEXT NOT NULL,
  source           TEXT NOT NULL,               -- 'photo' | 'text' | 'favourite' | 'manual'
  title            TEXT,                        -- short label for the list
  user_text        TEXT,
  photo_key        TEXT,                        -- R2 object key, null if none / purged
  photo_expires_at TEXT,
  calories         REAL NOT NULL DEFAULT 0,
  protein_g        REAL NOT NULL DEFAULT 0,
  carbs_g          REAL NOT NULL DEFAULT 0,
  fat_g            REAL NOT NULL DEFAULT 0,
  confidence       REAL,                        -- 0..1 from the estimator
  items_json       TEXT,                        -- [{name, qty, unit, calories, protein_g, carbs_g, fat_g}]
  assumptions      TEXT,
  ai_raw_json      TEXT,
  edited           INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_entries_tracking_date ON entries (tracking_date);
CREATE INDEX idx_entries_photo_expiry ON entries (photo_expires_at) WHERE photo_expires_at IS NOT NULL;

-- Saved meals for one-tap logging (no AI call).
CREATE TABLE favourites (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  calories        REAL NOT NULL DEFAULT 0,
  protein_g       REAL NOT NULL DEFAULT 0,
  carbs_g         REAL NOT NULL DEFAULT 0,
  fat_g           REAL NOT NULL DEFAULT 0,
  source_entry_id TEXT,
  use_count       INTEGER NOT NULL DEFAULT 0,
  last_used_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Body-weight measurements (manual entry or Home Assistant push).
CREATE TABLE weights (
  id             TEXT PRIMARY KEY,
  measured_at    TEXT NOT NULL,
  tracking_date  TEXT NOT NULL,
  weight_kg      REAL NOT NULL,
  body_fat_pct   REAL,
  bmr_kcal       REAL,
  muscle_mass_kg REAL,
  source         TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'wyze_ha' | 'other'
  raw_json       TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (measured_at, source)
);
CREATE INDEX idx_weights_tracking_date ON weights (tracking_date);

-- Target history. The row with the greatest effective_date is the active target.
CREATE TABLE targets (
  id               TEXT PRIMARY KEY,
  effective_date   TEXT NOT NULL,               -- 'YYYY-MM-DD'
  calorie_target   INTEGER NOT NULL,
  protein_target_g INTEGER NOT NULL,
  tdee_estimate    INTEGER,
  basis            TEXT NOT NULL,               -- 'manual' | 'calculator' | 'adaptive'
  surplus_kcal     INTEGER NOT NULL DEFAULT 0,
  trend_weight_kg  REAL,
  note             TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_targets_effective_date ON targets (effective_date);

-- Long-lived facts the AI can use. `status='suggested'` rows are AI proposals
-- awaiting the user's accept/reject.
CREATE TABLE memory_notes (
  id              TEXT PRIMARY KEY,
  text            TEXT NOT NULL,
  category        TEXT,                         -- free-form: dislikes / staples / schedule / ...
  status          TEXT NOT NULL DEFAULT 'active', -- 'active' | 'archived' | 'suggested'
  origin          TEXT NOT NULL DEFAULT 'user', -- 'user' | 'ai'
  source_entry_id TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_memory_status ON memory_notes (status);

-- Coach messages shown in the day timeline.
CREATE TABLE coach_messages (
  id            TEXT PRIMARY KEY,
  entry_id      TEXT,
  tracking_date TEXT NOT NULL,
  text          TEXT NOT NULL,
  model         TEXT,
  context_json  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_coach_tracking_date ON coach_messages (tracking_date);
