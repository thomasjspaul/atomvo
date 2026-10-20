-- Local dev seed data. Run with: npm run db:seed:local
-- Safe to re-run: it clears the data tables first (keeps settings row).

DELETE FROM coach_messages;
DELETE FROM entries;
DELETE FROM weights;
DELETE FROM targets;
DELETE FROM favourites;
DELETE FROM memory_notes;

UPDATE settings SET
  sex = 'male',
  birthdate = '1990-05-15',
  height_cm = 180,
  activity_multiplier = 1.55,
  goal = 'muscle_gain',
  surplus_kcal = 150,
  protein_g_per_kg = 2.0,
  units = 'imperial',
  timezone = 'America/Halifax',
  cohere_model = 'command-a-plus-05-2026'
WHERE id = 1;

INSERT INTO memory_notes (id, text, category, status, origin) VALUES
  (hex(randomblob(16)), 'Trains at the gym Mon/Wed/Fri mornings', 'schedule', 'active', 'user'),
  (hex(randomblob(16)), 'Standard protein shake = ~30 g protein, ~180 kcal', 'staples', 'active', 'user'),
  (hex(randomblob(16)), 'Dislikes mushrooms and blue cheese', 'dislikes', 'active', 'user'),
  (hex(randomblob(16)), 'Usually eats a big dinner around 7:30pm', 'schedule', 'active', 'user');

-- Starting manual target (app will layer calculator/adaptive rows on top over time)
INSERT INTO targets (id, effective_date, calorie_target, protein_target_g, tdee_estimate, basis, surplus_kcal, trend_weight_kg, note)
VALUES (hex(randomblob(16)), date('now','-20 days'), 2850, 165, 2700, 'calculator', 150, 83.9, 'seed');

-- ~18 days of weigh-ins, slow recomp drift
WITH RECURSIVE d(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM d WHERE n < 17)
INSERT INTO weights (id, measured_at, tracking_date, weight_kg, body_fat_pct, bmr_kcal, muscle_mass_kg, source)
SELECT
  hex(randomblob(16)),
  strftime('%Y-%m-%dT%H:%M:%SZ','now', '-' || (17 - n) || ' days', '+7 hours'),
  date('now', '-' || (17 - n) || ' days'),
  83.9 - (n * 0.015) + (CASE WHEN n % 3 = 0 THEN 0.25 ELSE -0.1 END),
  18.5 - (n * 0.02),
  1810,
  35.0 + (n * 0.01),
  'wyze_ha'
FROM d;

-- ~18 days of meals: breakfast + lunch + dinner-ish
WITH RECURSIVE d(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM d WHERE n < 17)
INSERT INTO entries (id, occurred_at, tracking_date, source, title, user_text, calories, protein_g, carbs_g, fat_g, confidence)
SELECT hex(randomblob(16)), strftime('%Y-%m-%dT%H:%M:%SZ','now','-'||(17-n)||' days','+8 hours'), date('now','-'||(17-n)||' days'),
  'text', 'Eggs, oats & berries', 'scrambled eggs, oatmeal, blueberries', 620, 34, 70, 22, 0.7 FROM d
UNION ALL
SELECT hex(randomblob(16)), strftime('%Y-%m-%dT%H:%M:%SZ','now','-'||(17-n)||' days','+13 hours'), date('now','-'||(17-n)||' days'),
  'text', 'Chicken rice bowl', 'grilled chicken, rice, veg', 780, 52, 88, 18, 0.72 FROM d
UNION ALL
SELECT hex(randomblob(16)), strftime('%Y-%m-%dT%H:%M:%SZ','now','-'||(17-n)||' days','+19 hours'), date('now','-'||(17-n)||' days'),
  'text', 'Salmon, potatoes, salad', 'baked salmon, roast potatoes, side salad', 850, 47, 62, 40, 0.68 FROM d
UNION ALL
SELECT hex(randomblob(16)), strftime('%Y-%m-%dT%H:%M:%SZ','now','-'||(17-n)||' days','+16 hours'), date('now','-'||(17-n)||' days'),
  'favourite', 'Protein shake', NULL, 180, 30, 6, 3, NULL FROM d;

INSERT INTO favourites (id, name, calories, protein_g, carbs_g, fat_g, use_count) VALUES
  (hex(randomblob(16)), 'Protein shake', 180, 30, 6, 3, 12),
  (hex(randomblob(16)), 'Greek yogurt + honey', 230, 20, 26, 4, 5);
