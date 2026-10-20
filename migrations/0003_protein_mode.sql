-- Protein target can be a fixed gram number instead of g/kg of body weight.
-- (Calories already track TDEE via surplus_kcal in the 'auto' target mode.)
ALTER TABLE settings ADD COLUMN protein_mode TEXT NOT NULL DEFAULT 'per_kg'; -- 'per_kg' | 'fixed'
