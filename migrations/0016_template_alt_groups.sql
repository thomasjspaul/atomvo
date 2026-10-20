-- Baseline-template exercise slots can group interchangeable alternatives.
-- workout_template_items rows sharing a group_key are one slot (lowest position
-- = the primary). When a session is seeded from a template the primary is added
-- and the slot's full roster is copied onto the workout_exercise as alt_json
-- (JSON [{name, catalog_id}, ...]) so it can be swapped mid-workout.
ALTER TABLE workout_template_items ADD COLUMN group_key TEXT;
ALTER TABLE workout_exercises ADD COLUMN alt_json TEXT;
