-- One target row per tracking day. Previously every "Save settings" appended a
-- row, so "Target & BMR over time" showed a point per save. Collapse history to
-- the most recently written row per day, then enforce it with a UNIQUE index so
-- future saves upsert that day's row instead of appending.

DELETE FROM targets
WHERE rowid NOT IN (SELECT MAX(rowid) FROM targets GROUP BY effective_date);

DROP INDEX IF EXISTS idx_targets_effective_date;
CREATE UNIQUE INDEX idx_targets_effective_date ON targets (effective_date);
