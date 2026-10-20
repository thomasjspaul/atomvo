import { useEffect, useState } from "react";
import { Select, Sheet, Spinner, TextInput } from "../ui";
import { scrollFieldIntoView } from "../../lib/dom";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import {
  useCanonicalizeExercise,
  useExercisePickGroups,
  useExercisesByMuscle,
  useExerciseSuggest,
  useRecentExercises,
} from "../../lib/queries";
import { MUSCLE_GROUPS } from "../../lib/workout";
import { relativeDay } from "../../lib/format";
import { todayISO } from "../../lib/day";
import type { ExerciseSuggestion } from "../../types";

// Quick-pick source, encoded for the <select>: "recent" | "plan" |
// "t:<templateId>" | "s:<sessionId>" | "m:<muscle>".
type Source = string;

export function ExerciseSearchSheet({
  onClose,
  onAdd,
  planPicks = [],
  addedNames = [],
}: {
  onClose: () => void;
  onAdd: (payload: { name: string; catalog_id?: string | null }) => void;
  planPicks?: { name: string; catalog_id: string | null }[];
  /** Exercises already in this workout — shown ticked so repeats are obvious. */
  addedNames?: string[];
}) {
  const [query, setQuery] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [source, setSource] = useState<Source>(planPicks.length ? "plan" : "recent");
  const debounced = useDebouncedValue(query.trim(), 250);
  const suggest = useExerciseSuggest(debounced);
  const recent = useRecentExercises();
  const groups = useExercisePickGroups();
  const muscle = source.startsWith("m:") ? source.slice(2) : null;
  const byMuscle = useExercisesByMuscle(muscle);
  const canonicalize = useCanonicalizeExercise();

  const added = new Set(addedNames.map((n) => n.toLowerCase()));

  const add = (payload: { name: string; catalog_id?: string | null }) => {
    onAdd(payload);
    onClose();
  };
  const pick = async (s: ExerciseSuggestion) => {
    if (s.catalog_id) {
      add({ name: s.canonical_name, catalog_id: s.catalog_id });
      return;
    }
    // AI-only suggestion — promote it into the catalog, then add with its id.
    setPromoting(true);
    try {
      const entry = await canonicalize.mutateAsync({
        canonical_name: s.canonical_name,
        primary_muscle: s.primary_muscle,
        equipment: s.equipment,
        alternatives: s.alternatives,
      });
      add({ name: entry.canonical_name, catalog_id: entry.id });
    } catch {
      add({ name: s.canonical_name });
    } finally {
      setPromoting(false);
    }
  };

  // Catalog matches resolve instantly; if the lookup is still running after a
  // beat it's almost certainly waiting on the AI. Escalate the label so the
  // user knows why it's taking a moment.
  const aiFetching = suggest.isFetching || byMuscle.isFetching;
  const [aiHint, setAiHint] = useState(false);
  useEffect(() => {
    if (!aiFetching) {
      setAiHint(false);
      return;
    }
    const t = setTimeout(() => setAiHint(true), 450);
    return () => clearTimeout(t);
  }, [aiFetching]);

  const usedAi =
    suggest.data?.source === "ai" || suggest.data?.source === "mixed";

  const results = suggest.data?.suggestions ?? [];
  const showTyped =
    debounced.length >= 2 &&
    !suggest.isFetching &&
    !results.some((r) => r.canonical_name.toLowerCase() === debounced.toLowerCase());

  const templates = groups.data?.groups.filter((g) => g.kind === "template") ?? [];
  const sessions = groups.data?.groups.filter((g) => g.kind === "session") ?? [];

  const pills: ExerciseSuggestion[] =
    source === "plan"
      ? planPicks.map((p) => ({
          catalog_id: p.catalog_id,
          canonical_name: p.name,
          primary_muscle: null,
          equipment: null,
          from_ai: false,
        }))
      : source === "recent"
        ? (recent.data?.exercises ?? [])
        : muscle
          ? (byMuscle.data?.suggestions ?? [])
          : (groups.data?.groups.find((g) => `${g.kind[0]}:${g.id}` === source)?.exercises ??
            []);

  return (
    <Sheet open onClose={onClose} title="Add exercise">
      <div className="space-y-3">
        <TextInput
          autoFocus
          placeholder="Search exercises…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={scrollFieldIntoView}
        />

        {debounced.length < 2 && (
          <div className="space-y-2">
            <Select
              aria-label="Pick from"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {planPicks.length > 0 && <option value="plan">This workout's plan</option>}
              <option value="recent">Recent exercises</option>
              {templates.length > 0 && (
                <optgroup label="Saved workouts">
                  {templates.map((g) => (
                    <option key={g.id} value={`t:${g.id}`}>
                      {g.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {sessions.length > 0 && (
                <optgroup label="Recent workouts">
                  {sessions.map((g) => (
                    <option key={g.id} value={`s:${g.id}`}>
                      {g.label}
                      {g.tracking_date ? ` · ${relativeDay(g.tracking_date, todayISO())}` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="By muscle">
                {MUSCLE_GROUPS.map((m) => (
                  <option key={m} value={`m:${m}`}>
                    {m[0].toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </optgroup>
            </Select>

            <div className="flex flex-wrap gap-1.5">
              {pills.map((r, i) => {
                const done = added.has(r.canonical_name.toLowerCase());
                return (
                  <button
                    key={`${r.catalog_id ?? r.canonical_name}-${i}`}
                    onClick={() => pick(r)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      source === "plan"
                        ? "border-[var(--pro)]"
                        : "border-[var(--border)] bg-[var(--surface-2)]"
                    } ${done ? "opacity-50" : ""}`}
                  >
                    {done && "✓ "}
                    {r.canonical_name}
                    {r.from_ai && <span className="text-[var(--text-dim)]"> · AI</span>}
                  </button>
                );
              })}
              {pills.length === 0 && !byMuscle.isFetching && (
                <p className="text-[11px] text-[var(--text-dim)]">Nothing here yet.</p>
              )}
            </div>
          </div>
        )}

        {(aiFetching || promoting) && (
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-dim)]">
            <Spinner className="h-3 w-3" />
            {promoting
              ? "Adding…"
              : aiHint
                ? "Asking AI…"
                : "Searching…"}
          </p>
        )}
        {!suggest.isFetching && !promoting && usedAi && results.length > 0 && (
          <p className="text-[11px] text-[var(--text-dim)]">
            Includes AI suggestions for “{debounced}”.
          </p>
        )}

        <div className="space-y-1">
          {results.map((r, i) => (
            <button
              key={`${r.catalog_id ?? r.canonical_name}-${i}`}
              onClick={() => pick(r)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3.5 text-left text-base active:brightness-95"
            >
              <span className="min-w-0 truncate">{r.canonical_name}</span>
              <span className="flex-none text-xs text-[var(--text-dim)]">
                {[r.primary_muscle, r.equipment].filter(Boolean).join(" · ")}
                {r.from_ai && " · AI"}
              </span>
            </button>
          ))}
          {showTyped && (
            <button
              onClick={() => query.trim() && add({ name: query.trim() })}
              className="w-full rounded-xl border border-dashed border-[var(--border)] px-3.5 py-3.5 text-left text-base text-[var(--text-dim)]"
            >
              Use “{query.trim()}” as typed
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
