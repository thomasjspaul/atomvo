// Nutrition science helpers. See plan for sources (Mifflin-St Jeor, protein 1.6-2.2 g/kg,
// energy-balance adaptive TDEE). Everything here works in SI.

export const KCAL_PER_KG = 7700; // approx energy per kg body mass
export const LB_PER_KG = 2.2046226218;

export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const kgToLb = (kg: number) => kg * LB_PER_KG;

export function ageFromBirthdate(birthdate: string, now = new Date()): number {
  const b = new Date(`${birthdate}T00:00:00Z`);
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export interface BmrInput {
  sex: "male" | "female";
  weightKg: number;
  heightCm: number;
  age: number;
}

/** Mifflin-St Jeor resting metabolic rate (kcal/day). */
export function mifflinStJeorBMR({ sex, weightKg, heightCm, age }: BmrInput): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return base + (sex === "male" ? 5 : -161);
}

export function tdeeFromBmr(bmr: number, activityMultiplier: number): number {
  return bmr * activityMultiplier;
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export interface TargetInput {
  tdee: number;
  surplusKcal: number;
  weightKg: number | null;
  proteinPerKg: number;
}

export function computeTargets({ tdee, surplusKcal, weightKg, proteinPerKg }: TargetInput): {
  calorie_target: number;
  protein_target_g: number;
} {
  const calorie_target = Math.max(1200, roundTo(tdee + surplusKcal, 10));
  // If we have no weight yet, back into protein from calories (~35% of intake / 4).
  const proteinFromWeight = weightKg ? weightKg * proteinPerKg : null;
  const proteinFromCals = (calorie_target * 0.35) / 4;
  const protein_target_g = roundTo(proteinFromWeight ?? proteinFromCals, 5);
  return { calorie_target, protein_target_g };
}

/**
 * Exponentially-weighted smoothing of a time series of daily values.
 * `points` must be ascending by date. Missing days are simply skipped
 * (carry the previous trend forward).
 */
export function ewma(
  points: Array<{ date: string; value: number }>,
  halfLifeDays = 10,
): Array<{ date: string; trend: number }> {
  if (points.length === 0) return [];
  const alpha = 1 - Math.pow(0.5, 1 / halfLifeDays);
  let trend = points[0].value;
  const out: Array<{ date: string; trend: number }> = [];
  for (const p of points) {
    trend = trend + alpha * (p.value - trend);
    out.push({ date: p.date, trend });
  }
  return out;
}

/**
 * Energy-balance adaptive TDEE.
 *   estTDEE ~= meanIntake - (deltaTrendWeightKg * KCAL_PER_KG) / days
 * Then blended 50/50 with the previous estimate and clamped to +/- maxStep.
 */
export function adaptiveTdee(args: {
  meanDailyIntakeKcal: number;
  trendWeightStartKg: number;
  trendWeightEndKg: number;
  days: number;
  previousEstimate: number | null;
  maxStepKcal?: number;
}): number {
  const { meanDailyIntakeKcal, trendWeightStartKg, trendWeightEndKg, days } = args;
  const maxStep = args.maxStepKcal ?? 150;
  const deltaKg = trendWeightEndKg - trendWeightStartKg;
  const raw = meanDailyIntakeKcal - (deltaKg * KCAL_PER_KG) / Math.max(days, 1);
  if (args.previousEstimate == null) return Math.round(raw);
  const blended = 0.5 * args.previousEstimate + 0.5 * raw;
  const clamped = Math.max(
    args.previousEstimate - maxStep,
    Math.min(args.previousEstimate + maxStep, blended),
  );
  return Math.round(clamped);
}
