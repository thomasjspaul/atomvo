-- Full body-composition metrics from the Wyze scale .xlsx export (source =
-- 'wyze_scale'). The regular Health Connect sync keeps filling the basics;
-- these columns stay NULL for those rows. Full export row is in raw_json.
ALTER TABLE weights ADD COLUMN bmi                  REAL;
ALTER TABLE weights ADD COLUMN muscle_mass_pct      REAL;
ALTER TABLE weights ADD COLUMN lean_mass_kg         REAL;
ALTER TABLE weights ADD COLUMN fat_mass_kg          REAL;
ALTER TABLE weights ADD COLUMN bone_mass_kg         REAL;
ALTER TABLE weights ADD COLUMN body_water_pct       REAL;
ALTER TABLE weights ADD COLUMN protein_pct          REAL;
ALTER TABLE weights ADD COLUMN visceral_fat         REAL;
ALTER TABLE weights ADD COLUMN metabolic_age        INTEGER;
ALTER TABLE weights ADD COLUMN skeletal_muscle_pct  REAL;
ALTER TABLE weights ADD COLUMN subcutaneous_fat_pct REAL;
