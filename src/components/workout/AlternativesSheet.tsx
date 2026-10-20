import { Sheet, Spinner } from "../ui";
import type { ExerciseAlternative } from "../../types";
import { useExerciseSuggest } from "../../lib/queries";

export function AlternativesSheet({
  exerciseName,
  catalogId,
  alternatives,
  onClose,
  onSwap,
}: {
  exerciseName: string;
  catalogId: string | null;
  alternatives: ExerciseAlternative[];
  onClose: () => void;
  onSwap: (alt: { name: string; catalog_id: string | null }) => void;
}) {
  // Custom/free-text exercises have no plan or catalog alternatives stored —
  // fall back to the same AI search used to add exercises, keyed off this
  // exercise's own name (server-side cached, so repeat swaps are instant).
  const needsLookup = alternatives.length === 0;
  const suggest = useExerciseSuggest(needsLookup ? exerciseName : "");
  const looked: ExerciseAlternative[] = needsLookup
    ? (suggest.data?.suggestions ?? [])
        .filter(
          (s) =>
            (catalogId == null || s.catalog_id !== catalogId) &&
            s.canonical_name.toLowerCase() !== exerciseName.trim().toLowerCase(),
        )
        .map((s) => ({
          name: s.canonical_name,
          catalog_id: s.catalog_id,
          primary_muscle: s.primary_muscle,
          equipment: s.equipment,
          source: "catalog" as const,
        }))
    : [];

  const all = needsLookup ? looked : alternatives;
  const loading = needsLookup && suggest.isFetching;
  const plan = all.filter((a) => a.source === "plan");
  const similar = all.filter((a) => a.source === "catalog");

  const row = (a: ExerciseAlternative, i: number) => (
    <button
      key={`${a.catalog_id ?? a.name}-${i}`}
      onClick={() => onSwap({ name: a.name, catalog_id: a.catalog_id })}
      className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-sm active:brightness-95"
    >
      <span>{a.name}</span>
      <span className="text-[11px] text-[var(--text-dim)]">
        {[a.primary_muscle, a.equipment].filter(Boolean).join(" · ")}
      </span>
    </button>
  );

  return (
    <Sheet open onClose={onClose} title="Swap exercise">
      {loading ? (
        <div className="py-6 text-center">
          <Spinner />
        </div>
      ) : all.length === 0 ? (
        <p className="text-sm text-[var(--text-dim)]">
          No alternatives found for this exercise.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] text-[var(--text-dim)]">
            Swapping keeps the sets you have already logged.
          </p>
          {plan.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium uppercase text-[var(--text-dim)]">
                From your plan
              </div>
              {plan.map(row)}
            </div>
          )}
          {similar.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium uppercase text-[var(--text-dim)]">
                Similar exercises
              </div>
              {similar.map(row)}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
