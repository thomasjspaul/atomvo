-- Optional per-entry creatine dose (grams), logged manually alongside a meal
-- (the AI estimator can't see it — Whoop's journal only records yes/no, not dose).
ALTER TABLE entries ADD COLUMN creatine_g REAL;
ALTER TABLE favourites ADD COLUMN creatine_g REAL;
