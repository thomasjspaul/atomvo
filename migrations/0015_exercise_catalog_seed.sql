-- Seed ~74 common strength/cardio exercises into exercise_catalog. Fixed ids
-- (seed_<norm_name>) so alt_ids_json can reference siblings literally. is_seed and
-- created_at take their column defaults. howto_query is set only where the
-- canonical name alone makes a weak web search; otherwise the client searches the
-- canonical name. AI fills any gap at runtime (is_seed=0 rows).

INSERT INTO exercise_catalog
  (id, canonical_name, norm_name, aliases_json, primary_muscle, equipment, category, howto_query, alt_ids_json)
VALUES
  ('seed_barbell_bench_press', 'Barbell Bench Press', 'barbell bench press', '["bench press","flat bench press","flat barbell bench"]', 'chest', 'barbell', 'compound', NULL, '["seed_incline_barbell_bench_press","seed_dumbbell_bench_press","seed_machine_chest_press","seed_push_up"]'),
  ('seed_incline_barbell_bench_press', 'Incline Barbell Bench Press', 'incline barbell bench press', '["incline bench press","incline barbell press"]', 'chest', 'barbell', 'compound', NULL, '["seed_incline_dumbbell_press","seed_dumbbell_bench_press","seed_machine_chest_press"]'),
  ('seed_dumbbell_bench_press', 'Dumbbell Bench Press', 'dumbbell bench press', '["db bench press","flat dumbbell press","dumbbell chest press"]', 'chest', 'dumbbell', 'compound', NULL, '["seed_barbell_bench_press","seed_incline_dumbbell_press","seed_machine_chest_press"]'),
  ('seed_incline_dumbbell_press', 'Incline Dumbbell Press', 'incline dumbbell press', '["incline db press","incline dumbbell bench press"]', 'chest', 'dumbbell', 'compound', NULL, '["seed_incline_barbell_bench_press","seed_dumbbell_bench_press"]'),
  ('seed_machine_chest_press', 'Machine Chest Press', 'machine chest press', '["chest press machine","seated chest press"]', 'chest', 'machine', 'compound', NULL, NULL),
  ('seed_cable_fly', 'Cable Fly', 'cable fly', '["cable crossover","cable flye","cable chest fly"]', 'chest', 'cable', 'isolation', NULL, '["seed_dumbbell_bench_press","seed_machine_chest_press"]'),
  ('seed_push_up', 'Push-Up', 'push up', '["pushup","press up","press-up"]', 'chest', 'bodyweight', 'compound', NULL, '["seed_dumbbell_bench_press","seed_dip"]'),
  ('seed_dip', 'Dip', 'dip', '["dips","chest dip","weighted dip"]', 'chest', 'bodyweight', 'compound', 'weighted chest dip', '["seed_close_grip_bench_press","seed_push_up","seed_machine_chest_press"]'),

  ('seed_deadlift', 'Deadlift', 'deadlift', '["conventional deadlift","barbell deadlift"]', 'back', 'barbell', 'compound', NULL, '["seed_rack_pull","seed_romanian_deadlift","seed_sumo_deadlift"]'),
  ('seed_barbell_row', 'Barbell Row', 'barbell row', '["bent over row","bent-over barbell row","pendlay row","bent over barbell row"]', 'back', 'barbell', 'compound', NULL, '["seed_single_arm_dumbbell_row","seed_seated_cable_row","seed_t_bar_row","seed_chest_supported_row"]'),
  ('seed_pull_up', 'Pull-Up', 'pull up', '["pullup","pull ups","wide grip pull up"]', 'back', 'bodyweight', 'compound', NULL, '["seed_chin_up","seed_lat_pulldown","seed_seated_cable_row"]'),
  ('seed_chin_up', 'Chin-Up', 'chin up', '["chinup","chin ups"]', 'back', 'bodyweight', 'compound', NULL, '["seed_pull_up","seed_lat_pulldown"]'),
  ('seed_lat_pulldown', 'Lat Pulldown', 'lat pulldown', '["pulldown","lat pull down","cable pulldown"]', 'back', 'cable', 'compound', NULL, '["seed_pull_up","seed_chin_up","seed_seated_cable_row"]'),
  ('seed_seated_cable_row', 'Seated Cable Row', 'seated cable row', '["cable row","seated row","low row"]', 'back', 'cable', 'compound', NULL, '["seed_barbell_row","seed_single_arm_dumbbell_row","seed_chest_supported_row"]'),
  ('seed_single_arm_dumbbell_row', 'Single-Arm Dumbbell Row', 'single arm dumbbell row', '["one arm dumbbell row","db row","dumbbell row"]', 'back', 'dumbbell', 'compound', NULL, '["seed_barbell_row","seed_seated_cable_row","seed_chest_supported_row"]'),
  ('seed_t_bar_row', 'T-Bar Row', 't bar row', '["tbar row","t-bar row"]', 'back', 'machine', 'compound', NULL, '["seed_barbell_row","seed_seated_cable_row"]'),
  ('seed_chest_supported_row', 'Chest-Supported Row', 'chest supported row', '["chest supported dumbbell row","seal row"]', 'back', 'machine', 'compound', NULL, '["seed_barbell_row","seed_single_arm_dumbbell_row"]'),
  ('seed_face_pull', 'Face Pull', 'face pull', '["cable face pull","rope face pull"]', 'back', 'cable', 'isolation', NULL, '["seed_rear_delt_fly"]'),
  ('seed_rack_pull', 'Rack Pull', 'rack pull', '["block pull"]', 'back', 'barbell', 'compound', NULL, '["seed_deadlift","seed_romanian_deadlift"]'),
  ('seed_barbell_shrug', 'Barbell Shrug', 'barbell shrug', '["shrug","dumbbell shrug","trap shrug"]', 'back', 'barbell', 'isolation', 'dumbbell shrug exercise', NULL),

  ('seed_overhead_press', 'Overhead Press', 'overhead press', '["ohp","standing press","military press","shoulder press","barbell shoulder press"]', 'shoulders', 'barbell', 'compound', NULL, '["seed_seated_dumbbell_shoulder_press","seed_machine_shoulder_press","seed_arnold_press"]'),
  ('seed_seated_dumbbell_shoulder_press', 'Seated Dumbbell Shoulder Press', 'seated dumbbell shoulder press', '["seated db press","dumbbell shoulder press","seated dumbbell press"]', 'shoulders', 'dumbbell', 'compound', NULL, '["seed_overhead_press","seed_machine_shoulder_press","seed_arnold_press"]'),
  ('seed_arnold_press', 'Arnold Press', 'arnold press', '["arnold shoulder press"]', 'shoulders', 'dumbbell', 'compound', NULL, '["seed_seated_dumbbell_shoulder_press","seed_overhead_press"]'),
  ('seed_machine_shoulder_press', 'Machine Shoulder Press', 'machine shoulder press', '["shoulder press machine","seated machine press"]', 'shoulders', 'machine', 'compound', NULL, '["seed_overhead_press","seed_seated_dumbbell_shoulder_press"]'),
  ('seed_lateral_raise', 'Lateral Raise', 'lateral raise', '["side raise","side lateral raise","db lateral raise","dumbbell lateral raise"]', 'shoulders', 'dumbbell', 'isolation', NULL, '["seed_cable_lateral_raise"]'),
  ('seed_cable_lateral_raise', 'Cable Lateral Raise', 'cable lateral raise', '["cable side raise"]', 'shoulders', 'cable', 'isolation', NULL, '["seed_lateral_raise"]'),
  ('seed_rear_delt_fly', 'Rear Delt Fly', 'rear delt fly', '["reverse fly","bent over lateral raise","rear delt raise","reverse pec deck"]', 'shoulders', 'dumbbell', 'isolation', NULL, '["seed_face_pull"]'),
  ('seed_front_raise', 'Front Raise', 'front raise', '["dumbbell front raise","plate front raise"]', 'shoulders', 'dumbbell', 'isolation', NULL, '["seed_lateral_raise"]'),

  ('seed_barbell_curl', 'Barbell Curl', 'barbell curl', '["bicep curl","biceps curl","ez bar curl","ez-bar curl"]', 'biceps', 'barbell', 'isolation', NULL, '["seed_dumbbell_curl","seed_cable_curl","seed_preacher_curl","seed_hammer_curl"]'),
  ('seed_dumbbell_curl', 'Dumbbell Curl', 'dumbbell curl', '["db curl","alternating dumbbell curl","standing dumbbell curl"]', 'biceps', 'dumbbell', 'isolation', NULL, '["seed_barbell_curl","seed_hammer_curl","seed_incline_dumbbell_curl"]'),
  ('seed_hammer_curl', 'Hammer Curl', 'hammer curl', '["dumbbell hammer curl","neutral grip curl"]', 'biceps', 'dumbbell', 'isolation', NULL, '["seed_dumbbell_curl","seed_cable_curl"]'),
  ('seed_preacher_curl', 'Preacher Curl', 'preacher curl', '["ez bar preacher curl","machine preacher curl"]', 'biceps', 'machine', 'isolation', NULL, '["seed_barbell_curl","seed_incline_dumbbell_curl"]'),
  ('seed_incline_dumbbell_curl', 'Incline Dumbbell Curl', 'incline dumbbell curl', '["incline db curl"]', 'biceps', 'dumbbell', 'isolation', NULL, '["seed_dumbbell_curl","seed_preacher_curl"]'),
  ('seed_cable_curl', 'Cable Curl', 'cable curl', '["cable bicep curl","rope curl"]', 'biceps', 'cable', 'isolation', NULL, '["seed_barbell_curl","seed_dumbbell_curl"]'),

  ('seed_close_grip_bench_press', 'Close-Grip Bench Press', 'close grip bench press', '["cgbp","close grip bench"]', 'triceps', 'barbell', 'compound', NULL, '["seed_triceps_pushdown","seed_skull_crusher","seed_dip"]'),
  ('seed_triceps_pushdown', 'Triceps Pushdown', 'triceps pushdown', '["tricep pushdown","rope pushdown","cable pushdown","tricep pressdown"]', 'triceps', 'cable', 'isolation', NULL, '["seed_overhead_triceps_extension","seed_skull_crusher","seed_close_grip_bench_press"]'),
  ('seed_overhead_triceps_extension', 'Overhead Triceps Extension', 'overhead triceps extension', '["overhead dumbbell extension","french press","overhead tricep extension"]', 'triceps', 'dumbbell', 'isolation', NULL, '["seed_triceps_pushdown","seed_skull_crusher"]'),
  ('seed_skull_crusher', 'Skull Crusher', 'skull crusher', '["lying triceps extension","ez bar skull crusher","skullcrusher"]', 'triceps', 'barbell', 'isolation', NULL, '["seed_triceps_pushdown","seed_overhead_triceps_extension"]'),
  ('seed_triceps_dip', 'Triceps Dip', 'triceps dip', '["bench dip","tricep dip"]', 'triceps', 'bodyweight', 'compound', NULL, '["seed_close_grip_bench_press","seed_triceps_pushdown"]'),
  ('seed_triceps_kickback', 'Triceps Kickback', 'triceps kickback', '["dumbbell kickback","tricep kickback"]', 'triceps', 'dumbbell', 'isolation', NULL, '["seed_triceps_pushdown"]'),

  ('seed_back_squat', 'Back Squat', 'back squat', '["squat","barbell back squat","barbell squat"]', 'quads', 'barbell', 'compound', NULL, '["seed_front_squat","seed_leg_press","seed_hack_squat","seed_goblet_squat"]'),
  ('seed_front_squat', 'Front Squat', 'front squat', '["barbell front squat"]', 'quads', 'barbell', 'compound', NULL, '["seed_back_squat","seed_hack_squat","seed_leg_press"]'),
  ('seed_leg_press', 'Leg Press', 'leg press', '["45 degree leg press","machine leg press"]', 'quads', 'machine', 'compound', NULL, '["seed_back_squat","seed_hack_squat","seed_goblet_squat"]'),
  ('seed_hack_squat', 'Hack Squat', 'hack squat', '["machine hack squat"]', 'quads', 'machine', 'compound', NULL, '["seed_leg_press","seed_back_squat","seed_front_squat"]'),
  ('seed_bulgarian_split_squat', 'Bulgarian Split Squat', 'bulgarian split squat', '["rear foot elevated split squat","rfess","split squat"]', 'quads', 'dumbbell', 'compound', NULL, '["seed_walking_lunge","seed_step_up","seed_leg_press"]'),
  ('seed_walking_lunge', 'Walking Lunge', 'walking lunge', '["lunge","dumbbell lunge","barbell lunge"]', 'quads', 'dumbbell', 'compound', NULL, '["seed_bulgarian_split_squat","seed_step_up"]'),
  ('seed_leg_extension', 'Leg Extension', 'leg extension', '["quad extension","knee extension"]', 'quads', 'machine', 'isolation', NULL, '["seed_hack_squat","seed_leg_press","seed_back_squat"]'),
  ('seed_goblet_squat', 'Goblet Squat', 'goblet squat', '["dumbbell goblet squat","kettlebell goblet squat"]', 'quads', 'dumbbell', 'compound', NULL, '["seed_back_squat","seed_leg_press"]'),
  ('seed_step_up', 'Step-Up', 'step up', '["dumbbell step up","box step up"]', 'quads', 'dumbbell', 'compound', 'dumbbell step up exercise', '["seed_walking_lunge","seed_bulgarian_split_squat"]'),

  ('seed_romanian_deadlift', 'Romanian Deadlift', 'romanian deadlift', '["rdl","romanian dead lift","barbell rdl"]', 'hamstrings', 'barbell', 'compound', NULL, '["seed_stiff_leg_deadlift","seed_lying_leg_curl","seed_good_morning","seed_seated_leg_curl"]'),
  ('seed_lying_leg_curl', 'Lying Leg Curl', 'lying leg curl', '["hamstring curl","leg curl","prone leg curl"]', 'hamstrings', 'machine', 'isolation', NULL, '["seed_seated_leg_curl","seed_romanian_deadlift"]'),
  ('seed_seated_leg_curl', 'Seated Leg Curl', 'seated leg curl', '["seated hamstring curl"]', 'hamstrings', 'machine', 'isolation', NULL, '["seed_lying_leg_curl","seed_romanian_deadlift"]'),
  ('seed_stiff_leg_deadlift', 'Stiff-Leg Deadlift', 'stiff leg deadlift', '["straight leg deadlift","sldl"]', 'hamstrings', 'barbell', 'compound', NULL, '["seed_romanian_deadlift","seed_good_morning"]'),
  ('seed_good_morning', 'Good Morning', 'good morning', '["barbell good morning"]', 'hamstrings', 'barbell', 'compound', 'barbell good morning exercise', '["seed_romanian_deadlift","seed_stiff_leg_deadlift"]'),

  ('seed_hip_thrust', 'Hip Thrust', 'hip thrust', '["barbell hip thrust","glute thrust"]', 'glutes', 'barbell', 'compound', NULL, '["seed_glute_bridge","seed_sumo_deadlift","seed_cable_kickback"]'),
  ('seed_glute_bridge', 'Glute Bridge', 'glute bridge', '["barbell glute bridge","hip bridge"]', 'glutes', 'bodyweight', 'compound', NULL, '["seed_hip_thrust","seed_cable_kickback"]'),
  ('seed_cable_kickback', 'Cable Kickback', 'cable kickback', '["glute kickback","cable glute kickback"]', 'glutes', 'cable', 'isolation', NULL, '["seed_hip_thrust","seed_glute_bridge"]'),
  ('seed_sumo_deadlift', 'Sumo Deadlift', 'sumo deadlift', '["sumo pull"]', 'glutes', 'barbell', 'compound', NULL, '["seed_deadlift","seed_hip_thrust"]'),

  ('seed_standing_calf_raise', 'Standing Calf Raise', 'standing calf raise', '["calf raise","machine calf raise"]', 'calves', 'machine', 'isolation', NULL, '["seed_seated_calf_raise","seed_leg_press_calf_raise"]'),
  ('seed_seated_calf_raise', 'Seated Calf Raise', 'seated calf raise', '["seated calf press"]', 'calves', 'machine', 'isolation', NULL, '["seed_standing_calf_raise","seed_leg_press_calf_raise"]'),
  ('seed_leg_press_calf_raise', 'Leg Press Calf Raise', 'leg press calf raise', '["calf press on leg press"]', 'calves', 'machine', 'isolation', NULL, '["seed_standing_calf_raise","seed_seated_calf_raise"]'),

  ('seed_plank', 'Plank', 'plank', '["front plank","forearm plank"]', 'core', 'bodyweight', 'isolation', 'plank exercise form', NULL),
  ('seed_hanging_leg_raise', 'Hanging Leg Raise', 'hanging leg raise', '["hanging knee raise","captains chair leg raise"]', 'core', 'bodyweight', 'isolation', NULL, '["seed_cable_crunch"]'),
  ('seed_cable_crunch', 'Cable Crunch', 'cable crunch', '["kneeling cable crunch","rope crunch"]', 'core', 'cable', 'isolation', NULL, '["seed_crunch","seed_hanging_leg_raise"]'),
  ('seed_russian_twist', 'Russian Twist', 'russian twist', '["weighted russian twist"]', 'core', 'bodyweight', 'isolation', NULL, NULL),
  ('seed_ab_wheel_rollout', 'Ab Wheel Rollout', 'ab wheel rollout', '["ab rollout","ab wheel"]', 'core', 'bodyweight', 'isolation', NULL, '["seed_plank"]'),
  ('seed_sit_up', 'Sit-Up', 'sit up', '["situp","weighted sit up"]', 'core', 'bodyweight', 'isolation', NULL, '["seed_crunch"]'),
  ('seed_crunch', 'Crunch', 'crunch', '["ab crunch","floor crunch"]', 'core', 'bodyweight', 'isolation', 'abdominal crunch exercise', '["seed_cable_crunch","seed_sit_up"]'),
  ('seed_pallof_press', 'Pallof Press', 'pallof press', '["cable pallof press","anti rotation press"]', 'core', 'cable', 'isolation', NULL, NULL),

  ('seed_treadmill_run', 'Treadmill Run', 'treadmill run', '["treadmill","running"]', 'cardio', 'machine', 'cardio', NULL, '["seed_elliptical","seed_stair_climber"]'),
  ('seed_stationary_bike', 'Stationary Bike', 'stationary bike', '["exercise bike","cycling","spin bike"]', 'cardio', 'machine', 'cardio', NULL, '["seed_elliptical","seed_rowing_machine"]'),
  ('seed_rowing_machine', 'Rowing Machine', 'rowing machine', '["rower","row erg","erg","concept 2"]', 'cardio', 'machine', 'cardio', NULL, '["seed_stationary_bike","seed_elliptical"]'),
  ('seed_elliptical', 'Elliptical', 'elliptical', '["cross trainer","elliptical trainer"]', 'cardio', 'machine', 'cardio', NULL, '["seed_treadmill_run","seed_stationary_bike"]'),
  ('seed_stair_climber', 'Stair Climber', 'stair climber', '["stairmaster","stair master","step mill"]', 'cardio', 'machine', 'cardio', NULL, '["seed_treadmill_run","seed_elliptical"]');
