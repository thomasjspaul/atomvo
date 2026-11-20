import { useMemo, useState } from "react";
import { Select, Sheet, Spinner, TextInput } from "../ui";
import { scrollFieldIntoView } from "../../lib/dom";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import {
  useCanonicalizeExercise,
  useExerciseAiSearch,
  useExerciseCatalog,
  useExercisePickGroups,
  useExercisesByMuscleAi,
  useRecentExercises,
} from "../../lib/queries";
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  capitalize,
  normalizeExerciseName,
  searchExerciseCatalog,
} from "../../lib/workout";
import { relativeDay } from "../../lib/format";
import { todayISO } from "../../lib/day";
import type { ExerciseCatalogItem, ExerciseSuggestion } from "../../types";

// Quick-pick source, encoded for the <select>: "recent" | "plan" |
// "t:<templateId>" | "s:<sessionId>" | "m:<muscle>" | "m:" (all exercises).
type Source = string;

const fromCatalog = (e: ExerciseCatalogItem): ExerciseSuggestion => ({
  catalog_id: e.id,
  canonical_name: e.name,
  primary_muscle: e.muscle,
  equipment: e.equipment,
  from_ai: false,
});

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
  const [equipment, setEquipment] = useState("");
  // AI only runs on an explicit tap, remembered per query / muscle.
  const [aiQuery, setAiQuery] = useState<string | null>(null);
  const [aiMuscle, setAiMuscle] = useState<string | null>(null);

  const typed = query.trim();
  const debounced = useDebouncedValue(typed, 300);
  const catalog = useExerciseCatalog();
  const recent = useRecentExercises();
  const groups = useExercisePickGroups();
  const canonicalize = useCanonicalizeExercise();

  const browsing = source.startsWith("m:");
  const muscle = browsing ? source.slice(2) || null : null;
  const aiSearch = useExerciseAiSearch(debounced, aiQuery === debounced);
  const aiByMuscle = useExercisesByMuscleAi(muscle, aiMuscle != null && aiMuscle === muscle);

  const added = new Set(addedNames.map((n) => n.toLowerCase()));
  const all = catalog.data?.exercises ?? [];

  // Instant local search. A body-area / equipment choice narrows it.
  const local = useMemo(
    () =>
      typed.length >= 2
        ? searchExerciseCatalog(all, typed, {
            muscle: browsing ? muscle : null,
            equipment: browsing ? equipment || null : null,
            limit: 40,
          })
        : [],
    [all, typed, browsing, muscle, equipment],
  );
  const browseList = useMemo(
    () =>
      browsing
        ? searchExerciseCatalog(all, "", { muscle, equipment: equipment || null })
        : [],
    [all, browsing, muscle, equipment],
  );

  const add = (payload: { name: string; catalog_id?: string | null }) => {
    onAdd(payload);
    onClose();
  };
  const pick = async (s: ExerciseSuggestion) => {
    if (s.catalog_id) {
      add({ name: s.canonical_name, catalog_id: s.catalog_id });
      return;
    }
    // AI-only suggestion — save it into the catalog (so it's found instantly
    // next time), then add with its id.
    setPromoting(true);
    try {
      const entry = await canonicalize.mutateAsync({
        canonical_name: s.canonical_name,
        primary_muscle: s.primary_muscle,
        equipment: s.equipment,
        alternatives: s.alternatives,
        description: s.description ?? null,
      });
      add({ name: entry.canonical_name, catalog_id: entry.id });
    } catch {
      add({ name: s.canonical_name });
    } finally {
      setPromoting(false);
    }
  };

  // AI rows not already shown from the local catalog.
  const localIds = new Set(local.map((e) => e.id));
  const aiResults =
    aiQuery === debounced
      ? (aiSearch.data?.suggestions ?? []).filter(
          (s) => !(s.catalog_id && localIds.has(s.catalog_id)),
        )
      : [];
  const browseIds = new Set(browseList.map((e) => e.id));
  const aiMuscleExtra =
    aiMuscle === muscle
      ? (aiByMuscle.data?.suggestions ?? []).filter(
          (s) =>
            !(s.catalog_id && browseIds.has(s.catalog_id)) &&
            (!equipment || s.equipment === equipment),
        )
      : [];
  const aiBusy =
    (aiQuery === debounced && aiSearch.isFetching) ||
    (aiMuscle === muscle && aiByMuscle.isFetching);

  const typedNorm = normalizeExerciseName(typed);
  const exactShown =
    local.some((e) => e.norm === typedNorm) ||
    aiResults.some((s) => normalizeExerciseName(s.canonical_name) === typedNorm);

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
        : browsing
          ? []
          : (groups.data?.groups.find((g) => `${g.kind[0]}:${g.id}` === source)?.exercises ??
            []);

  const row = (r: ExerciseSuggestion, key: string, lastDone?: string | null) => {
    const done = added.has(r.canonical_name.toLowerCase());
    return (
      <button
        key={key}
        onClick={() => pick(r)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-left text-base active:brightness-95 ${
          done ? "opacity-50" : ""
        }`}
      >
        <span className="min-w-0">
          <span className="block truncate">
            {done && "✓ "}
            {r.canonical_name}
          </span>
          {r.description && (
            <span className="block text-xs text-[var(--text-dim)]">{r.description}</span>
          )}
        </span>
        <span className="flex-none text-right text-xs text-[var(--text-dim)]">
          {[r.primary_muscle, r.equipment].filter(Boolean).join(" · ")}
          {r.from_ai && " · AI"}
          {lastDone && <span className="block">{relativeDay(lastDone, todayISO())}</span>}
        </span>
      </button>
    );
  };

  const filters = (
    <div className="flex gap-2">
      <Select
        aria-label="Pick from"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        className="min-w-0 flex-1"
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
        <optgroup label="Body area">
          <option value="m:">All exercises</option>
          {MUSCLE_GROUPS.map((m) => (
            <option key={m} value={`m:${m}`}>
              {capitalize(m)}
            </option>
          ))}
        </optgroup>
      </Select>
      {browsing && (
        <Select
          aria-label="Equipment"
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
          className="min-w-0 flex-1"
        >
          <option value="">Any equipment</option>
          {EQUIPMENT.map((q) => (
            <option key={q} value={q}>
              {capitalize(q)}
            </option>
          ))}
        </Select>
      )}
    </div>
  );

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

        {filters}

        {catalog.isLoading && (
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-dim)]">
            <Spinner className="h-3 w-3" /> Loading exercises…
          </p>
        )}

        {/* Quick picks: plan / recent / saved & recent workouts */}
        {typed.length < 2 && !browsing && (
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
                </button>
              );
            })}
            {pills.length === 0 && (
              <p className="text-[11px] text-[var(--text-dim)]">Nothing here yet.</p>
            )}
          </div>
        )}

        {/* Browse a body area from the local catalog */}
        {typed.length < 2 && browsing && (
          <div className="space-y-1">
            <p className="text-[11px] text-[var(--text-dim)]">
              {browseList.length} exercise{browseList.length === 1 ? "" : "s"} · ones you've done
              first
            </p>
            {browseList.map((e) => row(fromCatalog(e), e.id, e.last_done))}
            {aiMuscleExtra.map((s, i) => row(s, `ai-${s.canonical_name}-${i}`))}
            {muscle && aiMuscle !== muscle && (
              <button
                onClick={() => setAiMuscle(muscle)}
                className="w-full rounded-xl border border-dashed border-[var(--border)] px-3.5 py-3 text-left text-sm text-[var(--text-dim)]"
              >
                ✨ More {muscle} ideas from AI
              </button>
            )}
          </div>
        )}

        {/* Typed search: instant local results, AI on request */}
        {typed.length >= 2 && (
          <div className="space-y-1">
            {browsing && (muscle || equipment) && (
              <p className="text-[11px] text-[var(--text-dim)]">
                Only {[muscle, equipment].filter(Boolean).join(" · ")} —{" "}
                <button
                  className="underline"
                  onClick={() => {
                    setSource("m:");
                    setEquipment("");
                  }}
                >
                  search everything
                </button>
              </p>
            )}
            {local.map((e) => row(fromCatalog(e), e.id, e.last_done))}
            {local.length === 0 && !catalog.isLoading && (
              <p className="text-[11px] text-[var(--text-dim)]">
                No saved exercise matches “{typed}”.
              </p>
            )}

            {aiResults.length > 0 && (
              <p className="pt-2 text-[11px] text-[var(--text-dim)]">AI suggestions</p>
            )}
            {aiResults.map((s, i) => row(s, `ai-${s.canonical_name}-${i}`))}
            {aiQuery === debounced &&
              !aiSearch.isFetching &&
              aiSearch.isFetched &&
              aiResults.length === 0 && (
                <p className="text-[11px] text-[var(--text-dim)]">
                  AI couldn't find anything else for “{debounced}”.
                </p>
              )}

            {aiQuery !== debounced && debounced === typed && (
              <button
                onClick={() => setAiQuery(debounced)}
                className={`w-full rounded-xl border px-3.5 py-3 text-left text-sm ${
                  local.length < 3
                    ? "border-[var(--pro)] text-[var(--text)]"
                    : "border-dashed border-[var(--border)] text-[var(--text-dim)]"
                }`}
              >
                ✨ Search with AI for “{debounced}”
              </button>
            )}
            {!exactShown && (
              <button
                onClick={() => add({ name: typed })}
                className="w-full rounded-xl border border-dashed border-[var(--border)] px-3.5 py-3 text-left text-sm text-[var(--text-dim)]"
              >
                Use “{typed}” as typed
              </button>
            )}
          </div>
        )}

        {(aiBusy || promoting) && (
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-dim)]">
            <Spinner className="h-3 w-3" />
            {promoting ? "Saving…" : "Asking AI — this can take a few seconds…"}
          </p>
        )}
      </div>
    </Sheet>
  );
}
