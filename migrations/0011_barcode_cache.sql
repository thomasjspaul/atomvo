-- Cache of Open Food Facts lookups by barcode. Products are effectively
-- immutable, so cache aggressively — including "not found" (found = 0) so a
-- missing barcode isn't re-fetched on every scan.
CREATE TABLE barcode_cache (
  code       TEXT PRIMARY KEY,
  found      INTEGER NOT NULL,
  payload    TEXT,   -- normalized JSON; null when found = 0
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
