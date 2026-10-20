-- BMR now has one explicit source, chosen under Profile: entered by hand,
-- computed from the profile (Mifflin-St Jeor), or synced from the scale / Health
-- Connect. No silent fallback between them.
ALTER TABLE settings ADD COLUMN bmr_mode TEXT NOT NULL DEFAULT 'calculated'; -- 'manual' | 'calculated' | 'synced'

-- Seed from what the row already implies: a hand-entered bmr_kcal means 'manual';
-- otherwise, if any synced BMR exists anywhere, 'synced'; else 'calculated'.
UPDATE settings SET bmr_mode = 'manual' WHERE bmr_kcal IS NOT NULL;
UPDATE settings SET bmr_mode = 'synced'
  WHERE bmr_kcal IS NULL
    AND (EXISTS (SELECT 1 FROM weights WHERE bmr_kcal IS NOT NULL)
      OR EXISTS (SELECT 1 FROM daily_energy WHERE bmr_kcal IS NOT NULL));
