// Types shared between the Worker API and the React client.
// Keep this file dependency-free.

export type MealSource = "photo" | "text" | "favourite" | "manual" | "barcode";
export type TargetBasis = "manual" | "calculator" | "adaptive" | "tracked";
export type TdeeBasis = "formula" | "adaptive" | "tracked";
export type MemoryStatus = "active" | "archived" | "suggested";
export type WeightSource =
  | "manual"
  | "wyze_ha"
  | "wyze_scale" // full .xlsx export from the Wyze app
  | "health_connect"
  | "other";

export interface Macros {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface EstimatedItem extends Macros {
  name: string;
  qty: number | null;
  unit: string | null;
}

export interface Entry extends Macros {
  id: string;
  occurred_at: string;
  tracking_date: string;
  source: MealSource;
  title: string | null;
  user_text: string | null;
  photo_key: string | null;
  photo_url: string | null;
  confidence: number | null;
  items: EstimatedItem[];
  assumptions: string | null;
  edited: boolean;
  created_at: string;
  creatine_g: number | null; // manual, not AI-estimated
}

export interface CoachMessage {
  id: string;
  entry_id: string | null;
  tracking_date: string;
  text: string;
  created_at: string;
}

export interface Target {
  id: string;
  effective_date: string;
  calorie_target: number;
  protein_target_g: number;
  tdee_estimate: number | null;
  basis: TargetBasis;
  surplus_kcal: number;
  trend_weight_kg: number | null;
  note: string | null;
  created_at: string;
}

export interface DayResponse {
  tracking_date: string;
  target: Target | null;
  totals: Macros;
  remaining: { calories: number; protein_g: number };
  entries: Entry[];
  coach_messages: CoachMessage[];
  hours_left_in_day: number;
  energy: DayEnergy | null;
  hydration: DayHydration | null;
}

export interface Favourite extends Macros {
  id: string;
  name: string;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  creatine_g: number | null;
}

export interface Weight {
  id: string;
  measured_at: string;
  tracking_date: string;
  weight_kg: number;
  body_fat_pct: number | null;
  bmr_kcal: number | null;
  muscle_mass_kg: number | null;
  source: WeightSource;
  created_at: string;
  // extended body composition — populated only from the Wyze .xlsx import
  bmi: number | null;
  muscle_mass_pct: number | null;
  lean_mass_kg: number | null;
  fat_mass_kg: number | null;
  bone_mass_kg: number | null;
  body_water_pct: number | null;
  protein_pct: number | null;
  visceral_fat: number | null;
  metabolic_age: number | null;
  skeletal_muscle_pct: number | null;
  subcutaneous_fat_pct: number | null;
}

export interface WeightTrendPoint {
  date: string;
  weight_kg: number | null; // raw measurement that day, if any
  trend_kg: number; // smoothed
}

export interface MemoryNote {
  id: string;
  text: string;
  category: string | null;
  status: MemoryStatus;
  origin: "user" | "ai";
  source_entry_id: string | null;
  created_at: string;
}

export interface Settings {
  timezone: string;
  day_rollover_hour: number;
  units: "imperial" | "metric";
  sex: "male" | "female" | null;
  birthdate: string | null;
  height_cm: number | null;
  activity_multiplier: number;
  goal: "muscle_gain" | "recomp";
  surplus_kcal: number;
  protein_g_per_kg: number;
  bmr_source: "mifflin" | "scale";
  adaptive_enabled: boolean;
  cohere_model: string;
  coach_style: "off" | "brief" | "balanced" | "detailed";
  focus_mode: boolean;
  target_mode: "auto" | "manual";
  manual_calorie_target: number | null;
  manual_protein_target: number | null;
  protein_mode: "per_kg" | "fixed";
  tdee_basis: TdeeBasis; // deprecated, unused
  hydration_target_ml: number; // 0 = hydration tracking off
  bmr_kcal: number | null; // resting BMR — entered or synced; calorie target = this + surplus_kcal
  bmr_mode: "manual" | "calculated" | "synced"; // which BMR source the calculated target uses
  current_gym_id: string | null; // scalar pointer into the gyms table; null = none picked
}

export interface HydrationEntry {
  id: string;
  occurred_at: string;
  ml: number; // counts toward the goal
  volume_ml: number; // actual amount in the cup
  kind: "water" | "caffeine";
}

export interface DayHydration {
  total_ml: number;
  target_ml: number;
  entries: HydrationEntry[];
}

export interface DayEnergy {
  active_kcal: number | null;
  total_kcal: number | null;
  steps: number | null;
  bmr_kcal: number | null;
  burned_kcal: number | null; // total_kcal, else active_kcal + resting BMR, else BMR (assumed floor)
  net_kcal: number | null; // intake − burned_kcal
  basis: "measured" | "estimated"; // 'estimated' = no activity synced, burn assumed = BMR
  updated_at: string | null; // last Health Connect sync for this day
}

export interface StatsResponse {
  range_days: number;
  daily: Array<{
    date: string;
    calories: number;
    protein_g: number;
    calorie_target: number | null;
    protein_target_g: number | null;
    bmr_kcal: number | null; // BMR recorded on the target active that day
    water_ml: number; // total hydration counted toward the goal
    burned_kcal: number | null;
    steps: number | null;
    logged: boolean;
  }>;
  water_target_ml: number; // current hydration target (historical target isn't stored)
  weight_trend: WeightTrendPoint[];
  weight_rate_kg_per_week: number | null;
  muscle_trend: WeightTrendPoint[]; // same shape; weight_kg/trend_kg hold muscle mass
  muscle_rate_kg_per_week: number | null;
  target_history: Array<{
    date: string;
    calorie_target: number;
    protein_target_g: number;
    tdee_estimate: number | null;
    basis: TargetBasis;
  }>;
  adherence: {
    days_in_range: number;
    days_logged: number;
    pct: number;
    current_streak: number;
  };
}

export interface LogMealResponse {
  entry: Entry;
  coach_message: CoachMessage | null;
  memory_suggestion: MemoryNote | null;
}

export interface InsightsNutritionDay {
  date: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  water_ml: number | null;
  creatine_g: number | null;
}

export interface InsightsWhoopDay {
  date: string;
  recovery_pct: number | null;
  hrv_ms: number | null;
  resting_hr: number | null;
  day_strain: number | null;
  energy_burned: number | null;
}

export interface InsightsWorkout {
  date: string;
  activity: string;
  strain: number | null;
  energy_burned: number | null;
  duration_min: number | null;
}

export interface InsightsBodyDay {
  date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  bmi: number | null;
  muscle_mass_kg: number | null;
  lean_mass_kg: number | null;
  fat_mass_kg: number | null;
  bone_mass_kg: number | null;
  body_water_pct: number | null;
  protein_pct: number | null;
  visceral_fat: number | null;
  metabolic_age: number | null;
  skeletal_muscle_pct: number | null;
  subcutaneous_fat_pct: number | null;
}

export interface InsightsResponse {
  range_days: number;
  nutrition: InsightsNutritionDay[];
  whoop_days: InsightsWhoopDay[];
  workouts: InsightsWorkout[];
  body: InsightsBodyDay[]; // latest Wyze reading per tracking day, in range
  body_latest: InsightsBodyDay | null; // newest Wyze reading overall
}

export interface WyzeImportResult {
  new: number;
  existing: number;
  superseded: number; // Health Connect weigh-ins removed as duplicates
  latest: { measured_at: string; weight_kg: number | null; body_fat_pct: number | null } | null;
}

export interface WhoopImportResult {
  files: Record<
    "cycles" | "sleeps" | "workouts" | "journal",
    { new: number; existing: number }
  >;
  skipped: number; // in-progress / template rows not imported
  energy_days: number; // days whose calories-burned was set from Whoop
  warnings: string[];
}

export interface BarcodeLookup {
  found: boolean;
  code: string;
  name: string;
  brand: string | null;
  serving_g: number | null; // grams (ml treated as g); null if OFF has no serving size
  serving_label: string | null; // e.g. "30 g", "1 cup (240 ml)"
  per_100g: Macros;
  per_serving: Macros | null;
  image_url: string | null;
}

// ---- gym ----------------------------------------------------------------

export type GymReportType = "sessions" | "sets" | "exercise_summary" | "personal_records";
export type WorkoutStatus = "active" | "finished" | "abandoned";

export interface Gym {
  id: string;
  name: string;
  location: string | null;
  archived: boolean;
  created_at: string;
}

export interface ExerciseCatalogRef {
  id: string;
  canonical_name: string;
  primary_muscle: string | null;
  equipment: string | null;
}

export interface ExerciseCatalogEntry extends ExerciseCatalogRef {
  aliases: string[];
  category: string | null;
  howto_query: string | null; // search text for the how-to link; falls back to canonical_name
  alternatives: ExerciseCatalogRef[];
  is_seed: boolean;
  description: string | null; // AI-filled on first log
  secondary_muscles: string[];
}

/** A row in the exercise search box. `catalog_id` null = AI-only / free-text. */
export interface ExerciseSuggestion {
  catalog_id: string | null;
  canonical_name: string;
  primary_muscle: string | null;
  equipment: string | null;
  from_ai: boolean;
  alternatives?: string[]; // AI-only rows: substitute exercise names, used on canonicalise
}

export interface ExerciseSuggestResponse {
  suggestions: ExerciseSuggestion[];
  source: "catalog" | "ai" | "mixed";
}

export interface ExercisePerformedSet {
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  is_warmup: boolean;
}

/** What the user did with this exercise in their most recent prior finished session. */
export interface LastExercisePerformance {
  session_id: string;
  tracking_date: string;
  sets: ExercisePerformedSet[];
  best_set: ExercisePerformedSet | null;
  est_1rm: number | null; // kg, Epley, from best_set
}

export interface WorkoutSet extends ExercisePerformedSet {
  id: string;
  workout_exercise_id: string;
  created_at: string;
  updated_at: string;
}

/** An interchangeable exercise the user can swap to. `catalog_id` null = free text. */
export interface ExerciseAlternative {
  name: string;
  catalog_id: string | null;
  primary_muscle: string | null;
  equipment: string | null;
  source: "plan" | "catalog";
}

export interface WorkoutExercise {
  id: string;
  session_id: string;
  catalog_id: string | null;
  name: string;
  norm_name: string;
  position: number;
  target_sets: number | null;
  target_reps: string | null;
  notes: string | null;
  sets: WorkoutSet[];
  last: LastExercisePerformance | null;
  howto_query: string | null;
  alternatives: ExerciseAlternative[]; // this slot's plan alternatives + catalog similars
  // From the catalog row; null/[] until AI enrichment has run for it.
  description: string | null;
  primary_muscle: string | null;
  secondary_muscles: string[];
}

export interface WorkoutSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  tracking_date: string;
  status: WorkoutStatus;
  gym_id: string | null;
  gym_name: string | null;
  template_id: string | null;
  title: string | null;
  notes: string | null;
}

export interface WorkoutSessionDetail extends WorkoutSession {
  exercises: WorkoutExercise[];
}

/** A source of quick-pick exercises in the add-exercise sheet. */
export interface ExercisePickGroup {
  kind: "template" | "session";
  id: string;
  label: string;
  tracking_date: string | null; // sessions only
  exercises: ExerciseSuggestion[];
}

export interface ExercisePickGroupsResponse {
  groups: ExercisePickGroup[];
}

export interface WorkoutSessionSummary extends WorkoutSession {
  exercise_count: number;
  set_count: number;
  total_volume_kg: number;
  avg_rpe: number | null;
}

export interface WorkoutTemplateItem {
  id: string;
  template_id: string;
  catalog_id: string | null;
  name: string;
  norm_name: string;
  position: number;
  target_sets: number | null;
  target_reps: string | null;
  target_rpe: number | null;
  notes: string | null;
  group_key: string | null; // items sharing a key are one slot; lowest position = primary
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  description: string | null;
  position: number;
  archived: boolean;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  items: WorkoutTemplateItem[];
}

export interface ExerciseProgressRow {
  norm_name: string;
  canonical_name: string;
  catalog_id: string | null;
  last_done: string | null;
  sessions: number;
  top_weight_kg: number | null;
  top_est_1rm: number | null;
  total_volume_kg: number;
}

export interface MuscleBalanceCount {
  exercises: number;
  sets: number; // working sets (warm-ups excluded)
}

export interface MuscleBalanceResponse {
  days: number;
  muscles: Array<MuscleBalanceCount & { muscle: string }>;
  cardio: MuscleBalanceCount;
  unclassified: MuscleBalanceCount;
}

export interface ExerciseProgressPoint {
  date: string;
  top_weight_kg: number | null;
  top_est_1rm: number | null;
  volume_kg: number;
  avg_rpe: number | null;
}
