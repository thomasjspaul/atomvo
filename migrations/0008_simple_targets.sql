-- Simplified targets: calorie target = BMR + surplus (no activity multiplier,
-- no adaptive/tracked expenditure). BMR is one number, entered or synced.
ALTER TABLE settings ADD COLUMN bmr_kcal INTEGER;

-- Seed it from whatever we can: a synced scale/HC BMR, else the last known
-- Mifflin isn't computable in SQL, so leave null and let the app prefill.
UPDATE settings
SET bmr_kcal = (
  SELECT bmr_kcal FROM weights WHERE bmr_kcal IS NOT NULL ORDER BY measured_at DESC LIMIT 1
)
WHERE bmr_kcal IS NULL;
