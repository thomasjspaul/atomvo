import { Hono } from "hono";
import type { AppContext } from "../env";
import { getSettings, nowIso } from "../db";
import { num, bool } from "../util";
import { ageFromBirthdate, kgToLb, mifflinStJeorBMR } from "../nutrition";
import { effectiveBmr, latestScaleBmr, latestWeightKg, recomputeTarget } from "../service";

export const settings = new Hono<AppContext>();

settings.get("/", async (c) => {
  const s = await getSettings(c.env);
  const [weightKg, scaleBmr] = await Promise.all([
    latestWeightKg(c.env),
    latestScaleBmr(c.env),
  ]);

  let mifflin: number | null = null;
  if (s.sex && s.height_cm && s.birthdate && weightKg) {
    mifflin = Math.round(
      mifflinStJeorBMR({
        sex: s.sex,
        weightKg,
        heightCm: s.height_cm,
        age: ageFromBirthdate(s.birthdate),
      }),
    );
  }
  return c.json({
    settings: s,
    derived: {
      latest_weight_kg: weightKg,
      latest_weight_lb: weightKg ? Number(kgToLb(weightKg).toFixed(1)) : null,
      mifflin_bmr: mifflin,
      scale_bmr: scaleBmr,
      effective_bmr: await effectiveBmr(c.env, s),
    },
    ingest: {
      // shown read-only in Settings so HA can be wired up
      url: "/api/ingest/weight",
      configured: Boolean(c.env.INGEST_SHARED_SECRET),
    },
    ai_configured: Boolean(c.env.COHERE_API_KEY),
  });
});

const ACTIVITY_MIN = 1.2;
const ACTIVITY_MAX = 2.2;

settings.put("/", async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const cur = await getSettings(c.env);

  const next = {
    timezone: b.timezone !== undefined ? String(b.timezone) : cur.timezone,
    day_rollover_hour:
      b.day_rollover_hour !== undefined
        ? Math.min(6, Math.max(0, Math.round(num(b.day_rollover_hour))))
        : cur.day_rollover_hour,
    units: b.units === "metric" ? "metric" : b.units === "imperial" ? "imperial" : cur.units,
    sex:
      b.sex === "male" || b.sex === "female"
        ? b.sex
        : b.sex === null
          ? null
          : cur.sex,
    birthdate: b.birthdate !== undefined ? (b.birthdate ? String(b.birthdate) : null) : cur.birthdate,
    height_cm:
      b.height_cm !== undefined
        ? b.height_cm == null
          ? null
          : num(b.height_cm)
        : cur.height_cm,
    activity_multiplier:
      b.activity_multiplier !== undefined
        ? Math.min(ACTIVITY_MAX, Math.max(ACTIVITY_MIN, num(b.activity_multiplier)))
        : cur.activity_multiplier,
    goal: b.goal === "recomp" ? "recomp" : b.goal === "muscle_gain" ? "muscle_gain" : cur.goal,
    surplus_kcal:
      b.surplus_kcal !== undefined
        ? Math.min(1500, Math.max(-1500, Math.round(num(b.surplus_kcal))))
        : cur.surplus_kcal,
    protein_g_per_kg:
      b.protein_g_per_kg !== undefined
        ? Math.min(3.0, Math.max(1.2, num(b.protein_g_per_kg)))
        : cur.protein_g_per_kg,
    bmr_source: b.bmr_source === "scale" ? "scale" : b.bmr_source === "mifflin" ? "mifflin" : cur.bmr_source,
    adaptive_enabled:
      b.adaptive_enabled !== undefined ? (bool(b.adaptive_enabled) ? 1 : 0) : cur.adaptive_enabled ? 1 : 0,
    cohere_model: b.cohere_model !== undefined ? String(b.cohere_model) : cur.cohere_model,
    coach_style: ["off", "brief", "balanced", "detailed"].includes(String(b.coach_style))
      ? String(b.coach_style)
      : cur.coach_style,
    focus_mode: b.focus_mode !== undefined ? (bool(b.focus_mode) ? 1 : 0) : cur.focus_mode ? 1 : 0,
    target_mode:
      b.target_mode === "manual" ? "manual" : b.target_mode === "auto" ? "auto" : cur.target_mode,
    manual_calorie_target:
      b.manual_calorie_target !== undefined
        ? b.manual_calorie_target == null
          ? null
          : Math.max(800, Math.min(8000, Math.round(num(b.manual_calorie_target))))
        : cur.manual_calorie_target,
    manual_protein_target:
      b.manual_protein_target !== undefined
        ? b.manual_protein_target == null
          ? null
          : Math.max(20, Math.min(500, Math.round(num(b.manual_protein_target))))
        : cur.manual_protein_target,
    protein_mode:
      b.protein_mode === "fixed" ? "fixed" : b.protein_mode === "per_kg" ? "per_kg" : cur.protein_mode,
    tdee_basis: ["formula", "adaptive", "tracked"].includes(String(b.tdee_basis))
      ? String(b.tdee_basis)
      : cur.tdee_basis,
    hydration_target_ml:
      b.hydration_target_ml !== undefined
        ? Math.max(0, Math.min(8000, Math.round(num(b.hydration_target_ml))))
        : cur.hydration_target_ml,
    bmr_kcal:
      b.bmr_kcal !== undefined
        ? b.bmr_kcal == null || Number(b.bmr_kcal) <= 0
          ? null
          : Math.max(600, Math.min(5000, Math.round(num(b.bmr_kcal))))
        : cur.bmr_kcal,
    bmr_mode:
      b.bmr_mode === "manual" || b.bmr_mode === "synced" || b.bmr_mode === "calculated"
        ? b.bmr_mode
        : cur.bmr_mode,
    current_gym_id:
      b.current_gym_id !== undefined
        ? b.current_gym_id
          ? String(b.current_gym_id)
          : null
        : cur.current_gym_id,
  };
  // keep the legacy flag consistent (unused by recompute now)
  next.adaptive_enabled = next.tdee_basis === "formula" ? 0 : 1;

  await c.env.DB.prepare(
    `UPDATE settings SET
       timezone=?, day_rollover_hour=?, units=?, sex=?, birthdate=?, height_cm=?,
       activity_multiplier=?, goal=?, surplus_kcal=?, protein_g_per_kg=?, bmr_source=?,
       adaptive_enabled=?, cohere_model=?, coach_style=?, focus_mode=?,
       target_mode=?, manual_calorie_target=?, manual_protein_target=?, protein_mode=?,
       tdee_basis=?, hydration_target_ml=?, bmr_kcal=?, bmr_mode=?, current_gym_id=?, updated_at=?
     WHERE id = 1`,
  )
    .bind(
      next.timezone,
      next.day_rollover_hour,
      next.units,
      next.sex,
      next.birthdate,
      next.height_cm,
      next.activity_multiplier,
      next.goal,
      next.surplus_kcal,
      next.protein_g_per_kg,
      next.bmr_source,
      next.adaptive_enabled,
      next.cohere_model,
      next.coach_style,
      next.focus_mode,
      next.target_mode,
      next.manual_calorie_target,
      next.manual_protein_target,
      next.protein_mode,
      next.tdee_basis,
      next.hydration_target_ml,
      next.bmr_kcal,
      next.bmr_mode,
      next.current_gym_id,
      nowIso(),
    )
    .run();

  // Upserts today's target row (one point per day on the history chart).
  await recomputeTarget(c.env, "settings-change").catch(() => null);
  return c.json({ settings: await getSettings(c.env) });
});
