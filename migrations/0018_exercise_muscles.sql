-- AI-filled exercise metadata, so sessions can later be analysed by muscle
-- group. Filled lazily the first time an exercise is logged (seed rows
-- included) when description is still null. secondary_muscles_json is a
-- JSON string[] using the same muscle vocabulary as primary_muscle.
ALTER TABLE exercise_catalog ADD COLUMN description TEXT;
ALTER TABLE exercise_catalog ADD COLUMN secondary_muscles_json TEXT;

-- Backdated sessions sort by the day they happened, not when they were typed in.
CREATE INDEX idx_workout_sessions_date_started ON workout_sessions (tracking_date, started_at);
