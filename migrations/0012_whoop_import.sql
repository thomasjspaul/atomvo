-- Raw rows from a Whoop data export (.zip of physiological_cycles / sleeps /
-- workouts / journal_entries CSVs). One generic table: the whole CSV row is kept
-- as JSON in `data` so Whoop changing its columns never breaks the import.
-- Dedup is by (file, natural_key); re-importing the full export is idempotent.
CREATE TABLE whoop_data (
  file          TEXT NOT NULL,        -- 'cycles' | 'sleeps' | 'workouts' | 'journal'
  natural_key   TEXT NOT NULL,        -- stable per-row key within the file
  occurred_at   TEXT,                 -- representative UTC instant, ISO-8601
  tracking_date TEXT,                 -- local tracking day (3am rollover); cycles & workouts
  data          TEXT NOT NULL,        -- the full CSV row as a JSON object
  imported_at   TEXT NOT NULL,
  PRIMARY KEY (file, natural_key)
);
CREATE INDEX idx_whoop_data_file_date ON whoop_data (file, tracking_date);
