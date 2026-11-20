import type {
  ExerciseCatalogItem,
  ExercisePerformedSet,
  WorkoutSessionDetail,
  WorkoutTemplateItem,
} from "../types";
import { kgToLb, lbToKg, relativeDay, round } from "./format";
import { todayISO } from "./day";

/** Fold flat template items into slots by group_key; first (lowest position) is primary. */
export function groupTemplateItems(items: WorkoutTemplateItem[]): {
  primary: WorkoutTemplateItem;
  alternatives: WorkoutTemplateItem[];
}[] {
  const byKey = new Map<string, WorkoutTemplateItem[]>();
  const order: string[] = [];
  for (const it of items) {
    const key = it.group_key ?? `solo:${it.id}`;
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(it);
  }
  return order.map((key) => {
    const group = byKey.get(key)!.slice().sort((a, b) => a.position - b.position);
    return { primary: group[0], alternatives: group.slice(1) };
  });
}

export const weightUnit = (imperial: boolean) => (imperial ? "lb" : "kg");

/** kg (server) → the string to show in a weight input, in the user's units. "" for null. */
export function weightToInput(kg: number | null, imperial: boolean): string {
  if (kg == null) return "";
  return String(imperial ? round(kgToLb(kg), 1) : round(kg, 1));
}

/** weight input string (user's units) → kg for the server. null when blank / non-positive. */
export function inputToKg(v: string, imperial: boolean): number | null {
  const n = Number(v);
  if (!v.trim() || !Number.isFinite(n) || n <= 0) return null;
  return imperial ? lbToKg(n) : n;
}

export function displayKg(kg: number, imperial: boolean): string {
  return String(imperial ? round(kgToLb(kg), 1) : round(kg, 1));
}

/** kg → number in the user's units (for chart series). */
export const displayKgNum = (kg: number, imperial: boolean): number =>
  imperial ? round(kgToLb(kg), 1) : round(kg, 1);

/** One set: "60kg × 8 @8", "BW × 12", "60kg × 8". */
export function setSummary(s: ExercisePerformedSet, imperial: boolean): string {
  const w =
    s.weight_kg == null ? "BW" : `${displayKg(s.weight_kg, imperial)}${weightUnit(imperial)}`;
  const reps = s.reps == null ? "?" : String(s.reps);
  const rpe = s.rpe == null ? "" : s.rpe <= 5 ? " @<6" : ` @${s.rpe}`;
  return `${w} × ${reps}${rpe}`;
}

/** Whole set list as one line, collapsing equal consecutive sets: "3×8 @ 60kg · 1×6 @ 65kg". */
export function groupedSummary(sets: ExercisePerformedSet[], imperial: boolean): string {
  const working = sets.filter((s) => !s.is_warmup);
  if (!working.length) return "—";
  const groups: { key: string; count: number; label: string }[] = [];
  for (const s of working) {
    const w =
      s.weight_kg == null ? "BW" : `${displayKg(s.weight_kg, imperial)}${weightUnit(imperial)}`;
    const reps = s.reps == null ? "?" : String(s.reps);
    const key = `${w}|${reps}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.count++;
    else groups.push({ key, count: 1, label: `${reps} @ ${w}` });
  }
  return groups.map((g) => `${g.count}×${g.label}`).join(" · ");
}

/** Display title for a session: its name, or a relative-day fallback. */
export function sessionTitle(session: Pick<WorkoutSessionDetail, "title" | "tracking_date">): string {
  return session.title || `${relativeDay(session.tracking_date, todayISO())} workout`;
}

/** Plain-text summary of a session for sharing/pasting: name, each exercise, each set. */
export function sessionToPlainText(session: WorkoutSessionDetail, imperial: boolean): string {
  const lines: string[] = [sessionTitle(session)];
  if (session.gym_name) lines.push(session.gym_name);
  for (const ex of session.exercises) {
    if (!ex.sets.length) continue;
    lines.push("");
    lines.push(ex.name);
    for (const s of ex.sets) {
      const label = s.is_warmup ? "W" : String(s.set_number);
      lines.push(`${label}. ${setSummary(s, imperial)}`);
    }
  }
  return lines.join("\n");
}

/** YouTube search for how to perform an exercise. */
export function howToUrl(nameOrQuery: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `how to ${nameOrQuery}`,
  )}`;
}

/** Equipment vocabulary used by the exercise catalog. */
export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "kettlebell",
  "cable",
  "machine",
  "smith",
  "bodyweight",
  "band",
  "other",
] as const;

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Mirrors normalizeExerciseName in worker/util.ts. */
export function normalizeExerciseName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

// Common shorthand people type in the gym → catalog wording.
const SHORTHAND: Record<string, string> = {
  db: "dumbbell",
  bb: "barbell",
  kb: "kettlebell",
  ohp: "overhead press",
  rdl: "romanian deadlift",
  bw: "bodyweight",
  tri: "triceps",
  tricep: "triceps",
  bicep: "biceps",
};

/** Does every query word start a word in `text`? ("inc db pr" → "incline dumbbell press") */
function wordsMatch(qWords: string[], text: string): boolean {
  const words = text.split(" ");
  return qWords.every((q) => words.some((w) => w.startsWith(q)));
}

/**
 * Instant in-browser search of the exercise catalog. Matches whole query
 * words as word prefixes in the name or any alias, so word order and
 * abbreviations don't matter. Exercises you've done float to the top.
 */
export function searchExerciseCatalog(
  catalog: ExerciseCatalogItem[],
  query: string,
  opts: { muscle?: string | null; equipment?: string | null; limit?: number } = {},
): ExerciseCatalogItem[] {
  const norm = normalizeExerciseName(query);
  const qWords = norm
    .split(" ")
    .filter(Boolean)
    .flatMap((w) => (SHORTHAND[w] ?? w).split(" "));
  const scored: { e: ExerciseCatalogItem; score: number }[] = [];
  for (const e of catalog) {
    if (opts.muscle && e.muscle !== opts.muscle) continue;
    if (opts.equipment && e.equipment !== opts.equipment) continue;
    let score: number;
    if (!qWords.length) score = 5;
    else if (e.norm === norm) score = 0;
    else if (e.aliases.includes(norm)) score = 1;
    else if (e.norm.startsWith(norm)) score = 2;
    else if (wordsMatch(qWords, e.norm)) score = 3;
    else if (e.aliases.some((a) => a.startsWith(norm) || wordsMatch(qWords, a))) score = 4;
    else if (norm.length >= 3 && e.norm.includes(norm)) score = 5;
    else continue;
    scored.push({ e, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      (b.e.last_done ?? "").localeCompare(a.e.last_done ?? "") ||
      a.e.name.length - b.e.name.length ||
      a.e.name.localeCompare(b.e.name),
  );
  const out = scored.map((x) => x.e);
  return opts.limit ? out.slice(0, opts.limit) : out;
}

/** Muscle-group vocabulary; mirrors MUSCLES in worker/ai.ts. */
export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "cardio",
] as const;
