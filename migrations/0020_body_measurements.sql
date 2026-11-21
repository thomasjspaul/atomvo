-- Tape-measure body measurements, logged by hand (waist for now; more columns can follow).
CREATE TABLE body_measurements (
  id            TEXT PRIMARY KEY,
  measured_at   TEXT NOT NULL,
  tracking_date TEXT NOT NULL,
  waist_cm      REAL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_body_measurements_tracking_date ON body_measurements (tracking_date);
