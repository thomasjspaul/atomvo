import type { Env } from "./env";
import type {
  CoachMessage,
  Entry,
  EstimatedItem,
  ExerciseCatalogEntry,
  ExerciseCatalogRef,
  Favourite,
  Gym,
  MemoryNote,
  Settings,
  Target,
  Weight,
  WorkoutSession,
  WorkoutSet,
  WorkoutStatus,
  WorkoutTemplate,
  WorkoutTemplateItem,
} from "../shared/types";

export const genId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

const bool = (n: unknown) => Number(n) === 1;

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ---- settings ---------------------------------------------------------------

export async function getSettings(env: Env): Promise<Settings> {
  const r = await env.DB.prepare("SELECT * FROM settings WHERE id = 1").first<Record<string, unknown>>();
  if (!r) throw new Error("settings row missing");
  return {
    timezone: String(r.timezone),
    day_rollover_hour: Number(r.day_rollover_hour),
    units: r.units === "metric" ? "metric" : "imperial",
    sex: r.sex === "male" || r.sex === "female" ? r.sex : null,
    birthdate: r.birthdate ? String(r.birthdate) : null,
    height_cm: r.height_cm == null ? null : Number(r.height_cm),
    activity_multiplier: Number(r.activity_multiplier),
    goal: r.goal === "recomp" ? "recomp" : "muscle_gain",
    surplus_kcal: Number(r.surplus_kcal),
    protein_g_per_kg: Number(r.protein_g_per_kg),
    bmr_source: r.bmr_source === "scale" ? "scale" : "mifflin",
    adaptive_enabled: bool(r.adaptive_enabled),
    cohere_model: String(r.cohere_model),
    coach_style:
      r.coach_style === "brief" ||
      r.coach_style === "detailed" ||
      r.coach_style === "off"
        ? r.coach_style
        : "balanced",
    focus_mode: bool(r.focus_mode),
    target_mode: r.target_mode === "manual" ? "manual" : "auto",
    manual_calorie_target: r.manual_calorie_target == null ? null : Number(r.manual_calorie_target),
    manual_protein_target: r.manual_protein_target == null ? null : Number(r.manual_protein_target),
    protein_mode: r.protein_mode === "fixed" ? "fixed" : "per_kg",
    tdee_basis:
      r.tdee_basis === "formula" || r.tdee_basis === "tracked" ? r.tdee_basis : "adaptive",
    hydration_target_ml: Number(r.hydration_target_ml ?? 0),
    bmr_kcal: r.bmr_kcal == null ? null : Number(r.bmr_kcal),
    bmr_mode:
      r.bmr_mode === "manual" || r.bmr_mode === "synced" ? r.bmr_mode : "calculated",
    current_gym_id: r.current_gym_id == null ? null : String(r.current_gym_id),
  };
}

export function effectiveTimezone(env: Env, s: Settings): string {
  return s.timezone || env.APP_TIMEZONE || "America/New_York";
}

export function rolloverHour(env: Env, s: Settings): number {
  return Number.isFinite(s.day_rollover_hour)
    ? s.day_rollover_hour
    : Number(env.DAY_ROLLOVER_HOUR ?? 3);
}

// ---- targets --------------------------------------------------------------

export function rowToTarget(r: Record<string, unknown>): Target {
  return {
    id: String(r.id),
    effective_date: String(r.effective_date),
    calorie_target: Number(r.calorie_target),
    protein_target_g: Number(r.protein_target_g),
    tdee_estimate: r.tdee_estimate == null ? null : Number(r.tdee_estimate),
    basis: r.basis as Target["basis"],
    surplus_kcal: Number(r.surplus_kcal),
    trend_weight_kg: r.trend_weight_kg == null ? null : Number(r.trend_weight_kg),
    note: r.note == null ? null : String(r.note),
    created_at: String(r.created_at),
  };
}

export async function getActiveTarget(env: Env, onDate?: string): Promise<Target | null> {
  const sql = onDate
    ? "SELECT * FROM targets WHERE effective_date <= ? ORDER BY effective_date DESC, created_at DESC LIMIT 1"
    : "SELECT * FROM targets ORDER BY effective_date DESC, created_at DESC LIMIT 1";
  const stmt = onDate ? env.DB.prepare(sql).bind(onDate) : env.DB.prepare(sql);
  const r = await stmt.first<Record<string, unknown>>();
  return r ? rowToTarget(r) : null;
}

// ---- entries -------------------------------------------------------------

export function photoUrlFor(entryId: string, photoKey: string | null): string | null {
  return photoKey ? `/api/meals/${entryId}/photo` : null;
}

export function rowToEntry(r: Record<string, unknown>): Entry {
  const id = String(r.id);
  const photo_key = r.photo_key ? String(r.photo_key) : null;
  return {
    id,
    occurred_at: String(r.occurred_at),
    tracking_date: String(r.tracking_date),
    source: r.source as Entry["source"],
    title: r.title == null ? null : String(r.title),
    user_text: r.user_text == null ? null : String(r.user_text),
    photo_key,
    photo_url: photoUrlFor(id, photo_key),
    calories: Number(r.calories),
    protein_g: Number(r.protein_g),
    carbs_g: Number(r.carbs_g),
    fat_g: Number(r.fat_g),
    confidence: r.confidence == null ? null : Number(r.confidence),
    items: parseJson<EstimatedItem[]>(r.items_json, []),
    assumptions: r.assumptions == null ? null : String(r.assumptions),
    edited: bool(r.edited),
    created_at: String(r.created_at),
    creatine_g: r.creatine_g == null ? null : Number(r.creatine_g),
  };
}

// ---- misc row mappers --------------------------------------------------

export function rowToFavourite(r: Record<string, unknown>): Favourite {
  return {
    id: String(r.id),
    name: String(r.name),
    calories: Number(r.calories),
    protein_g: Number(r.protein_g),
    carbs_g: Number(r.carbs_g),
    fat_g: Number(r.fat_g),
    use_count: Number(r.use_count),
    last_used_at: r.last_used_at ? String(r.last_used_at) : null,
    created_at: String(r.created_at),
    creatine_g: r.creatine_g == null ? null : Number(r.creatine_g),
  };
}

export function rowToWeight(r: Record<string, unknown>): Weight {
  const optn = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: String(r.id),
    measured_at: String(r.measured_at),
    tracking_date: String(r.tracking_date),
    weight_kg: Number(r.weight_kg),
    body_fat_pct: optn(r.body_fat_pct),
    bmr_kcal: optn(r.bmr_kcal),
    muscle_mass_kg: optn(r.muscle_mass_kg),
    source: r.source as Weight["source"],
    created_at: String(r.created_at),
    bmi: optn(r.bmi),
    muscle_mass_pct: optn(r.muscle_mass_pct),
    lean_mass_kg: optn(r.lean_mass_kg),
    fat_mass_kg: optn(r.fat_mass_kg),
    bone_mass_kg: optn(r.bone_mass_kg),
    body_water_pct: optn(r.body_water_pct),
    protein_pct: optn(r.protein_pct),
    visceral_fat: optn(r.visceral_fat),
    metabolic_age: optn(r.metabolic_age),
    skeletal_muscle_pct: optn(r.skeletal_muscle_pct),
    subcutaneous_fat_pct: optn(r.subcutaneous_fat_pct),
  };
}

export function rowToMemory(r: Record<string, unknown>): MemoryNote {
  return {
    id: String(r.id),
    text: String(r.text),
    category: r.category == null ? null : String(r.category),
    status: r.status as MemoryNote["status"],
    origin: r.origin === "ai" ? "ai" : "user",
    source_entry_id: r.source_entry_id == null ? null : String(r.source_entry_id),
    created_at: String(r.created_at),
  };
}

export function rowToCoach(r: Record<string, unknown>): CoachMessage {
  return {
    id: String(r.id),
    entry_id: r.entry_id == null ? null : String(r.entry_id),
    tracking_date: String(r.tracking_date),
    text: String(r.text),
    created_at: String(r.created_at),
  };
}

// ---- gym row mappers --------------------------------------------------

export function rowToGym(r: Record<string, unknown>): Gym {
  return {
    id: String(r.id),
    name: String(r.name),
    location: r.location == null ? null : String(r.location),
    archived: bool(r.archived),
    created_at: String(r.created_at),
  };
}

export function rowToExerciseCatalogRef(r: Record<string, unknown>): ExerciseCatalogRef {
  return {
    id: String(r.id),
    canonical_name: String(r.canonical_name),
    primary_muscle: r.primary_muscle == null ? null : String(r.primary_muscle),
    equipment: r.equipment == null ? null : String(r.equipment),
  };
}

export function rowToExerciseCatalogEntry(
  r: Record<string, unknown>,
  alternatives: ExerciseCatalogRef[] = [],
): ExerciseCatalogEntry {
  return {
    ...rowToExerciseCatalogRef(r),
    aliases: parseJson<string[]>(r.aliases_json, []),
    category: r.category == null ? null : String(r.category),
    howto_query: r.howto_query == null ? null : String(r.howto_query),
    alternatives,
    is_seed: bool(r.is_seed),
    description: r.description == null ? null : String(r.description),
    secondary_muscles: parseJson<string[]>(r.secondary_muscles_json, []),
  };
}

export function rowToWorkoutSession(r: Record<string, unknown>): WorkoutSession {
  return {
    id: String(r.id),
    started_at: String(r.started_at),
    ended_at: r.ended_at == null ? null : String(r.ended_at),
    tracking_date: String(r.tracking_date),
    status: r.status as WorkoutStatus,
    gym_id: r.gym_id == null ? null : String(r.gym_id),
    gym_name: r.gym_name == null ? null : String(r.gym_name),
    template_id: r.template_id == null ? null : String(r.template_id),
    title: r.title == null ? null : String(r.title),
    notes: r.notes == null ? null : String(r.notes),
  };
}

export function rowToWorkoutSet(r: Record<string, unknown>): WorkoutSet {
  return {
    id: String(r.id),
    workout_exercise_id: String(r.workout_exercise_id),
    set_number: Number(r.set_number),
    weight_kg: r.weight_kg == null ? null : Number(r.weight_kg),
    reps: r.reps == null ? null : Number(r.reps),
    rpe: r.rpe == null ? null : Number(r.rpe),
    is_warmup: bool(r.is_warmup),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

export function rowToWorkoutTemplateItem(r: Record<string, unknown>): WorkoutTemplateItem {
  return {
    id: String(r.id),
    template_id: String(r.template_id),
    catalog_id: r.catalog_id == null ? null : String(r.catalog_id),
    name: String(r.name),
    norm_name: String(r.norm_name),
    position: Number(r.position),
    target_sets: r.target_sets == null ? null : Number(r.target_sets),
    target_reps: r.target_reps == null ? null : String(r.target_reps),
    target_rpe: r.target_rpe == null ? null : Number(r.target_rpe),
    notes: r.notes == null ? null : String(r.notes),
    group_key: r.group_key == null ? null : String(r.group_key),
  };
}

export function rowToWorkoutTemplate(
  r: Record<string, unknown>,
  items: WorkoutTemplateItem[] = [],
): WorkoutTemplate {
  return {
    id: String(r.id),
    name: String(r.name),
    description: r.description == null ? null : String(r.description),
    position: Number(r.position),
    archived: bool(r.archived),
    use_count: Number(r.use_count),
    last_used_at: r.last_used_at == null ? null : String(r.last_used_at),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    items,
  };
}
