-- Optional manual water tracker. hydration_target_ml = 0 means the feature is off.
CREATE TABLE hydration (
  id            TEXT PRIMARY KEY,
  occurred_at   TEXT NOT NULL,
  tracking_date TEXT NOT NULL,
  ml            REAL NOT NULL,
  source        TEXT NOT NULL DEFAULT 'manual',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_hydration_tracking_date ON hydration (tracking_date);

ALTER TABLE settings ADD COLUMN hydration_target_ml INTEGER NOT NULL DEFAULT 0;
