-- Distinguish plain water from caffeinated drinks. `ml` stays the amount that
-- counts toward the goal; `volume_ml` is what was actually in the cup.
ALTER TABLE hydration ADD COLUMN kind TEXT NOT NULL DEFAULT 'water'; -- 'water' | 'caffeine'
ALTER TABLE hydration ADD COLUMN volume_ml REAL;
UPDATE hydration SET volume_ml = ml WHERE volume_ml IS NULL;
