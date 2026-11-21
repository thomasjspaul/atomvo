-- Lifts picked for the Gym "Strength vs body weight" index: JSON array of normalized
-- exercise names. NULL = every lift.
ALTER TABLE settings ADD COLUMN key_lifts TEXT;
