-- Calorie burn / steps / BMR pulled from Health Connect, one row per tracking day.
CREATE TABLE daily_energy (
  tracking_date TEXT PRIMARY KEY,
  active_kcal   REAL,
  total_kcal    REAL,
  steps         INTEGER,
  bmr_kcal      REAL,
  source        TEXT NOT NULL DEFAULT 'health_connect',
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- How the calorie target's expenditure figure is derived.
--   'formula'  = Mifflin-St Jeor BMR x activity multiplier
--   'adaptive' = energy-balance learning from intake vs weight trend (previous default)
--   'tracked'  = rolling average of Health Connect total-calories-burned
ALTER TABLE settings ADD COLUMN tdee_basis TEXT NOT NULL DEFAULT 'adaptive';
UPDATE settings SET tdee_basis = CASE WHEN adaptive_enabled = 1 THEN 'adaptive' ELSE 'formula' END;
