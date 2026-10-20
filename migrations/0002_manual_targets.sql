-- Allow the user to set calorie / protein targets by hand instead of the
-- BMR x activity + surplus formula.
ALTER TABLE settings ADD COLUMN target_mode TEXT NOT NULL DEFAULT 'auto'; -- 'auto' | 'manual'
ALTER TABLE settings ADD COLUMN manual_calorie_target INTEGER;
ALTER TABLE settings ADD COLUMN manual_protein_target INTEGER;
