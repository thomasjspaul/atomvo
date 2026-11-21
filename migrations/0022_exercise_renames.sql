-- Log of exercise renames/merges from the clean-up tool, with a snapshot of every row
-- changed so each one can be undone.
CREATE TABLE exercise_renames (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  from_json     TEXT NOT NULL,   -- JSON string[] of the norm_names merged
  to_name       TEXT NOT NULL,
  to_norm_name  TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,   -- {exercises:[[id,name,norm,catalog]], sets:[[id,norm,catalog]], items:[[id,name,norm,catalog]], key_lifts}
  undone_at     TEXT
);
CREATE INDEX idx_exercise_renames_created ON exercise_renames (created_at);
