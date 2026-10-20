import type { Env } from "./env";
import type { EstimatedItem, Macros } from "../shared/types";

const COHERE_URL = "https://api.cohere.com/v2/chat";

export interface MealEstimate {
  title: string;
  items: EstimatedItem[];
  totals: Macros;
  confidence: number; // 0..1
  assumptions: string;
  needs_clarification: string | null;
  configured: boolean; // false when no API key -> caller should treat as a manual draft
}

const EMPTY_TOTALS: Macros = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

function sumItems(items: EstimatedItem[]): Macros {
  return items.reduce(
    (a, it) => ({
      calories: a.calories + (it.calories || 0),
      protein_g: a.protein_g + (it.protein_g || 0),
      carbs_g: a.carbs_g + (it.carbs_g || 0),
      fat_g: a.fat_g + (it.fat_g || 0),
    }),
    { ...EMPTY_TOTALS },
  );
}

async function callCohere(
  env: Env,
  model: string,
  messages: unknown[],
  schema: { name: string; schema: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const res = await fetch(COHERE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.COHERE_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      response_format: { type: "json_object", schema: schema.schema },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cohere ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    message?: { content?: Array<{ type?: string; text?: string }> };
  };
  const content = data.message?.content?.find((p) => p.type === "text")?.text ?? "{}";
  return JSON.parse(content) as Record<string, unknown>;
}

const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    qty: { type: ["number", "null"] },
    unit: { type: ["string", "null"] },
    calories: { type: "number" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
  },
  required: ["name", "qty", "unit", "calories", "protein_g", "carbs_g", "fat_g"],
};

const ESTIMATE_SCHEMA = {
  name: "meal_estimate",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", description: "3-6 word label for the meal" },
      identification: {
        type: "string",
        description:
          "Figure out exactly what this meal is BEFORE estimating macros. If a specific chain/restaurant/branded product is named or shown, state the exact product and size you matched it to. Otherwise, briefly state what you see/read.",
      },
      items: { type: "array", items: ITEM_SCHEMA },
      confidence: { type: "number", description: "0..1 overall confidence" },
      assumptions: { type: "string", description: "portion / preparation assumptions made" },
      needs_clarification: { type: ["string", "null"] },
    },
    required: [
      "title",
      "identification",
      "items",
      "confidence",
      "assumptions",
      "needs_clarification",
    ],
  },
};

function cleanItem(it: Partial<EstimatedItem>): EstimatedItem {
  return {
    name: String(it.name ?? "item"),
    qty: it.qty == null ? null : Number(it.qty),
    unit: it.unit == null ? null : String(it.unit),
    calories: Math.max(0, Number(it.calories) || 0),
    protein_g: Math.max(0, Number(it.protein_g) || 0),
    carbs_g: Math.max(0, Number(it.carbs_g) || 0),
    fat_g: Math.max(0, Number(it.fat_g) || 0),
  };
}

export async function estimateMeal(
  env: Env,
  opts: {
    text?: string | null;
    imageDataUrl?: string | null;
    memory?: string[];
    model?: string;
    knownItems?: EstimatedItem[]; // label-accurate components (e.g. scanned barcodes)
  },
): Promise<MealEstimate> {
  const model = opts.model || env.COHERE_MODEL || "command-a-plus-05-2026";
  const text = (opts.text || "").trim();
  const known = (opts.knownItems ?? []).map(cleanItem);

  // Nothing to estimate beyond the known components — skip the model entirely.
  if (known.length && !text && !opts.imageDataUrl) {
    return {
      title: known.length === 1 ? known[0].name : `${known[0].name} +${known.length - 1}`,
      items: known,
      totals: sumItems(known),
      confidence: 1,
      assumptions: "From product labels.",
      needs_clarification: null,
      configured: true,
    };
  }

  if (!env.COHERE_API_KEY) {
    return {
      title: text ? text.slice(0, 48) : known[0]?.name || "Meal",
      items: known,
      totals: sumItems(known),
      confidence: 0,
      assumptions: known.length
        ? "AI not configured — scanned items added, enter the rest manually."
        : "AI not configured — enter macros manually.",
      needs_clarification: null,
      configured: false,
    };
  }

  const memoryBlock = (opts.memory ?? []).slice(0, 40).map((m) => `- ${m}`).join("\n");
  const knownBlock = known
    .map(
      (it) =>
        `- ${it.name}: ${Math.round(it.calories)} kcal, ${Math.round(it.protein_g)}g protein, ${Math.round(it.carbs_g)}g carbs, ${Math.round(it.fat_g)}g fat`,
    )
    .join("\n");
  const system = [
    "You estimate the nutrition of a meal from a photo and/or a short description.",
    "Work in two steps, in this order:",
    "1) IDENTIFY (fill `identification` first): figure out exactly what the meal is. If the " +
      "description or photo names or shows a specific chain, restaurant, or branded product " +
      "(e.g. a Starbucks drink, a fast-food item, a packaged snack), name the exact product and " +
      "size you matched it to, and recall that product's actual published nutrition information. " +
      "Do NOT visually estimate a named branded item from scratch when you can identify it by " +
      "name — your recalled facts about it are more accurate than a guess from pixels. If it's a " +
      "home-cooked or generic meal with no identifiable product, briefly say what you see/read " +
      "instead.",
    "2) ESTIMATE (fill `items`): base the macros on what you identified in step 1 — the known " +
      "product's nutrition adjusted for any visible extras/toppings/modifications or a different " +
      "portion than implied — or, for unidentified food, your best realistic estimate for the " +
      "portion actually shown or described.",
    "When both a text description and a photo are given, the text is authoritative for brand, " +
      "product name, and any stated size or quantity (e.g. 'grande', 'footlong', '2 tacos'). Use " +
      "the photo only to check for visible extras, sauces, or a different amount than the text " +
      "states — never let the photo override an explicit brand/size/quantity typed by the user.",
    "Take your time and look carefully before committing to numbers. Once identified, prefer " +
      "decisiveness over hedging: pick the most likely match/portion and state it in `assumptions`.",
    "If the food is genuinely ambiguous even after this, still give your best estimate and put the question in `needs_clarification`.",
    known.length
      ? [
          "Some components are already measured exactly from product labels (listed below).",
          "Do NOT include those in your `items` and do NOT recount their calories — estimate ONLY the parts of the meal they do not cover.",
          "Measured components:",
          knownBlock,
        ].join("\n")
      : "",
    "Known facts about this person (use for portion sizes, default products, dietary pattern):",
    memoryBlock || "- (none yet)",
  ]
    .filter(Boolean)
    .join("\n");

  const userContent: unknown[] = [];
  if (text) userContent.push({ type: "text", text: `Description: ${text}` });
  else if (opts.imageDataUrl)
    userContent.push({ type: "text", text: "Estimate the meal in this photo." });
  else userContent.push({ type: "text", text: "Estimate the rest of this meal." });
  if (opts.imageDataUrl) {
    userContent.push({ type: "image_url", image_url: { url: opts.imageDataUrl, detail: "low" } });
  }

  const raw = await callCohere(
    env,
    model,
    [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    ESTIMATE_SCHEMA,
  );

  const aiItems: EstimatedItem[] = Array.isArray(raw.items)
    ? (raw.items as EstimatedItem[]).map(cleanItem)
    : [];
  const items = [...known, ...aiItems]; // measured components first, then estimated

  const identification = String(raw.identification || "").trim();
  const assumptions = String(raw.assumptions || "").trim();

  return {
    title: String(raw.title || (text ? text.slice(0, 48) : known[0]?.name || "Meal")),
    items,
    totals: sumItems(items),
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0)),
    assumptions: [identification, assumptions].filter(Boolean).join(" "),
    needs_clarification: raw.needs_clarification ? String(raw.needs_clarification) : null,
    configured: true,
  };
}

// ---- exercise autocomplete ---------------------------------------------

export interface ExerciseSuggestionAI {
  canonical_name: string;
  aliases: string[];
  primary_muscle: string | null;
  equipment: string | null;
  category: string | null;
  alternatives: string[];
}

const EXERCISE_SUGGEST_SCHEMA = {
  name: "exercise_suggestions",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            canonical_name: { type: "string" },
            aliases: { type: "array", items: { type: "string" } },
            primary_muscle: { type: ["string", "null"] },
            equipment: { type: ["string", "null"] },
            category: { type: ["string", "null"] },
            alternatives: { type: "array", items: { type: "string" } },
          },
          required: [
            "canonical_name",
            "aliases",
            "primary_muscle",
            "equipment",
            "category",
            "alternatives",
          ],
        },
      },
    },
    required: ["suggestions"],
  },
};

/**
 * Canonicalise a partial / misspelled exercise name to real exercise names.
 * Best-effort: returns [] with no API key or on any error — the caller falls
 * back to the seeded catalog + free text.
 */
export async function suggestExercises(
  env: Env,
  opts: {
    query: string;
    known?: string[];
    model?: string;
    limit?: number;
    /** When set, `query` is a muscle group: suggest good exercises for it instead. */
    muscle?: boolean;
  },
): Promise<ExerciseSuggestionAI[]> {
  if (!env.COHERE_API_KEY) return [];
  const query = (opts.query || "").trim();
  if (query.length < 2) return [];
  const model = opts.model || env.COHERE_MODEL || "command-a-plus-05-2026";
  const limit = Math.min(10, Math.max(1, opts.limit ?? 8));
  const known = (opts.known ?? []).slice(0, 60);

  const system = [
    opts.muscle
      ? `Suggest up to ${limit} effective, widely used gym exercises whose primary muscle is the given muscle group, mixing equipment (barbell, dumbbell, cable, machine, bodyweight), best first.`
      : "You normalise a partial or misspelled strength-training exercise name to real, canonical exercise names.",
    opts.muscle ? "" : `Return up to ${limit} exercises that best match the query, most likely first.`,
    "Use standard gym naming: 'Barbell Bench Press' not 'bench'; 'Romanian Deadlift' not 'rdl'.",
    "primary_muscle: one of chest, back, quads, hamstrings, glutes, shoulders, biceps, triceps, core, calves, cardio.",
    "equipment: one of barbell, dumbbell, machine, cable, bodyweight, kettlebell, smith.",
    "category: one of compound, isolation, cardio.",
    "alternatives: same-muscle substitute exercises with different equipment, as canonical names.",
    "Only return exercises that genuinely exist. Never invent a URL.",
    known.length
      ? `Prefer these existing names verbatim when they match:\n${known.map((k) => `- ${k}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await callCohere(
      env,
      model,
      [
        { role: "system", content: system },
        {
          role: "user",
          content: opts.muscle ? `Muscle group: ${query}` : `Query: "${query}"`,
        },
      ],
      EXERCISE_SUGGEST_SCHEMA,
    );
    const list = Array.isArray(raw.suggestions) ? raw.suggestions : [];
    return list
      .slice(0, limit)
      .map((it): ExerciseSuggestionAI => {
        const r = (it ?? {}) as Record<string, unknown>;
        return {
          canonical_name: String(r.canonical_name ?? "").trim(),
          aliases: Array.isArray(r.aliases) ? r.aliases.map(String).slice(0, 8) : [],
          primary_muscle: r.primary_muscle ? String(r.primary_muscle) : null,
          equipment: r.equipment ? String(r.equipment) : null,
          category: r.category ? String(r.category) : null,
          alternatives: Array.isArray(r.alternatives)
            ? r.alternatives.map(String).slice(0, 6)
            : [],
        };
      })
      .filter((s) => s.canonical_name.length > 1);
  } catch {
    return [];
  }
}

// ---- exercise enrichment -------------------------------------------------

export const MUSCLES = [
  "chest",
  "back",
  "quads",
  "hamstrings",
  "glutes",
  "shoulders",
  "biceps",
  "triceps",
  "core",
  "calves",
  "forearms",
  "cardio",
] as const;

export interface ExerciseEnrichment {
  description: string;
  primary_muscle: string | null;
  secondary_muscles: string[];
}

const EXERCISE_ENRICH_SCHEMA = {
  name: "exercise_enrichment",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      description: { type: "string" },
      primary_muscle: { type: ["string", "null"] },
      secondary_muscles: { type: "array", items: { type: "string" } },
    },
    required: ["description", "primary_muscle", "secondary_muscles"],
  },
};

function cleanMuscle(m: unknown): string | null {
  const v = String(m ?? "").trim().toLowerCase();
  return (MUSCLES as readonly string[]).includes(v) ? v : null;
}

/**
 * One-line description + muscle groups for a strength exercise. Best-effort:
 * null with no API key or on any error — the exercise just stays un-enriched.
 */
export async function enrichExercise(
  env: Env,
  opts: { name: string; model?: string },
): Promise<ExerciseEnrichment | null> {
  if (!env.COHERE_API_KEY) return null;
  const model = opts.model || env.COHERE_MODEL || "command-a-plus-05-2026";
  const system = [
    "You describe a gym exercise for a personal workout log.",
    "description: one short sentence (max ~20 words) on how it's performed and what it trains. No safety disclaimers.",
    `primary_muscle: the single main muscle group, one of ${MUSCLES.join(", ")}.`,
    "secondary_muscles: 0-3 other groups meaningfully worked, from the same list, excluding the primary.",
  ].join("\n");
  try {
    const raw = await callCohere(
      env,
      model,
      [
        { role: "system", content: system },
        { role: "user", content: `Exercise: "${opts.name}"` },
      ],
      EXERCISE_ENRICH_SCHEMA,
    );
    const primary = cleanMuscle(raw.primary_muscle);
    const secondary = Array.isArray(raw.secondary_muscles)
      ? [...new Set(raw.secondary_muscles.map(cleanMuscle))]
          .filter((m): m is string => Boolean(m) && m !== primary)
          .slice(0, 3)
      : [];
    const description = String(raw.description ?? "").trim();
    if (!description && !primary) return null;
    return { description, primary_muscle: primary, secondary_muscles: secondary };
  } catch {
    return null;
  }
}

// ---- workout title -------------------------------------------------------

const SPLITS = ["Upper", "Lower", "Full body", "Cardio"];

const WORKOUT_TITLE_SCHEMA = {
  name: "workout_title",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      split: { type: "string" },
      description: { type: "string" },
    },
    required: ["split", "description"],
  },
};

/**
 * "Upper · Chest & back push-pull" style title for a finished session.
 * Returns null on any failure so the caller can use its rule-based fallback.
 */
export async function workoutTitle(
  env: Env,
  opts: {
    model?: string;
    exercises: { name: string; primary_muscle: string | null; sets: number }[];
  },
): Promise<string | null> {
  if (!env.COHERE_API_KEY || !opts.exercises.length) return null;
  const model = opts.model || env.COHERE_MODEL || "command-a-plus-05-2026";
  const system = [
    "You name a finished gym workout for a personal log.",
    "split: exactly one of Upper, Lower, Full body, Cardio. Upper if it was mostly upper-body, Lower if mostly legs/glutes, Full body if a real mix, Cardio if mostly cardio.",
    "description: 2-5 words naming the focus, e.g. 'Chest & triceps push', 'Back and biceps', 'Quad-focused squats'. Sentence case, no trailing punctuation, don't repeat the split word.",
  ].join("\n");
  const user = opts.exercises
    .map((e) => `- ${e.name}${e.primary_muscle ? ` (${e.primary_muscle})` : ""}: ${e.sets} sets`)
    .join("\n");
  try {
    const raw = await callCohere(
      env,
      model,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      WORKOUT_TITLE_SCHEMA,
    );
    const split = SPLITS.find(
      (x) => x.toLowerCase() === String(raw.split ?? "").trim().toLowerCase(),
    );
    const desc = String(raw.description ?? "").trim().replace(/[.!]+$/, "");
    if (!split) return null;
    return desc ? `${split} · ${desc}` : split;
  } catch {
    return null;
  }
}

// ---- coach ---------------------------------------------------------------

export interface CoachResult {
  message: string;
  memory_suggestion: string | null;
}

const COACH_SCHEMA = {
  name: "coach_feedback",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      message: { type: "string", description: "2-3 sentences, gentle, practical, protein-first" },
      memory_suggestion: {
        type: ["string", "null"],
        description: "a durable fact worth remembering, or null",
      },
    },
    required: ["message", "memory_suggestion"],
  },
};

export async function coachFeedback(
  env: Env,
  opts: {
    model?: string;
    goal: string;
    coachStyle: string;
    focusMode: boolean;
    localTime: string;
    hoursLeft: number;
    totals: Macros;
    calorieTarget: number | null;
    proteinTarget: number | null;
    recentSummary: string;
    memory: string[];
    justLogged: string;
  },
): Promise<CoachResult | null> {
  if (!env.COHERE_API_KEY) return null;
  const model = opts.model || env.COHERE_MODEL || "command-a-plus-05-2026";

  const lengthHint =
    opts.coachStyle === "brief"
      ? "One short sentence."
      : opts.coachStyle === "detailed"
        ? "Up to 4 sentences."
        : "2-3 sentences.";

  const system = [
    "You are a calm, non-judgemental nutrition coach inside a food-tracking app.",
    `The user's goal is ${opts.goal.replace("_", " ")}. Protein is the priority; hitting the calorie floor matters more than staying under it.`,
    "Never shame or use failure framing. Use ranges, not exact prescriptions. Suggest concrete next foods that fit their known preferences and staples.",
    opts.focusMode ? "Focus mode is on: talk only about protein and one concrete next step." : "",
    lengthHint,
    "If you notice a stable fact worth remembering (a go-to meal and its macros, a dislike, a schedule pattern), put it in memory_suggestion; otherwise null.",
    "Known facts about this person:",
    opts.memory.slice(0, 40).map((m) => `- ${m}`).join("\n") || "- (none yet)",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `Local time: ${opts.localTime}. About ${opts.hoursLeft}h left in the tracking day.`,
    `Just logged: ${opts.justLogged}`,
    `Today so far: ${Math.round(opts.totals.calories)} kcal, ${Math.round(opts.totals.protein_g)} g protein, ${Math.round(opts.totals.carbs_g)} g carbs, ${Math.round(opts.totals.fat_g)} g fat.`,
    opts.calorieTarget
      ? `Targets: ${opts.calorieTarget} kcal, ${opts.proteinTarget} g protein. Remaining: ${Math.round(opts.calorieTarget - opts.totals.calories)} kcal, ${Math.round((opts.proteinTarget ?? 0) - opts.totals.protein_g)} g protein.`
      : "No targets set yet.",
    `Recent days: ${opts.recentSummary}`,
  ].join("\n");

  try {
    const raw = await callCohere(
      env,
      model,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      COACH_SCHEMA,
    );
    const sug = typeof raw.memory_suggestion === "string" ? raw.memory_suggestion.trim() : "";
    return {
      message: String(raw.message || "").trim(),
      // models sometimes emit the literal string "null"/"none" instead of JSON null
      memory_suggestion: sug && !/^(null|none|n\/?a|-)$/i.test(sug) ? sug : null,
    };
  } catch {
    return null; // coaching is best-effort; never block a log on it
  }
}
