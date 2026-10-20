import { useState } from "react";
import type { WorkoutExercise } from "../../types";
import { SetEditor } from "./SetEditor";
import { LastTimePanel } from "./LastTimePanel";
import { AlternativesSheet } from "./AlternativesSheet";
import { howToUrl } from "../../lib/workout";
import {
  useAddSet,
  useDeleteSessionExercise,
  usePatchSessionExercise,
} from "../../lib/queries";

export function ExerciseCard({
  sessionId,
  exercise,
  imperial,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  sessionId: string;
  exercise: WorkoutExercise;
  imperial: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const addSet = useAddSet();
  const removeExercise = useDeleteSessionExercise();
  const patchExercise = usePatchSessionExercise();
  const [menuOpen, setMenuOpen] = useState(false);
  const [altOpen, setAltOpen] = useState(false);

  const prevSet =
    [...exercise.sets].reverse().find((s) => !s.is_warmup) ?? exercise.sets.at(-1) ?? null;

  const addBlankSet = () =>
    addSet.mutate({
      sessionId,
      exId: exercise.id,
      weight_kg: prevSet?.weight_kg ?? null,
      reps: prevSet?.reps ?? null,
    });

  const copyLast = () => {
    for (const s of exercise.last?.sets.filter((x) => !x.is_warmup) ?? []) {
      addSet.mutate({
        sessionId,
        exId: exercise.id,
        weight_kg: s.weight_kg,
        reps: s.reps,
        rpe: s.rpe,
      });
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{exercise.name}</div>
          <div className="mt-0.5 flex flex-wrap gap-1.5 text-[10px] text-[var(--text-dim)]">
            {exercise.primary_muscle && (
              <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-px font-medium text-[var(--text)]">
                {exercise.primary_muscle}
              </span>
            )}
            {exercise.secondary_muscles.length > 0 && (
              <span className="py-px">+ {exercise.secondary_muscles.join(", ")}</span>
            )}
            {!exercise.catalog_id && <span className="py-px">custom</span>}
            {exercise.target_sets != null && (
              <span>
                target {exercise.target_sets}
                {exercise.target_reps ? ` × ${exercise.target_reps}` : ""}
              </span>
            )}
          </div>
          {exercise.description && (
            <p className="mt-1 text-[11px] leading-snug text-[var(--text-dim)]">
              {exercise.description}
            </p>
          )}
        </div>
        <div className="relative flex-none">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="px-2 text-lg leading-none text-[var(--text-dim)]"
            aria-label="Exercise options"
          >
            ⋯
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 text-sm shadow-lg">
                <a
                  href={howToUrl(exercise.howto_query || exercise.name)}
                  target="_blank"
                  rel="noreferrer"
                  className="block px-3 py-1.5"
                  onClick={() => setMenuOpen(false)}
                >
                  How to →
                </a>
                <button
                  className="block w-full px-3 py-1.5 text-left"
                  onClick={() => {
                    setMenuOpen(false);
                    setAltOpen(true);
                  }}
                >
                  Swap exercise
                </button>
                <button
                  className="block w-full px-3 py-1.5 text-left disabled:opacity-40"
                  disabled={!canMoveUp}
                  onClick={() => {
                    setMenuOpen(false);
                    onMoveUp();
                  }}
                >
                  Move up
                </button>
                <button
                  className="block w-full px-3 py-1.5 text-left disabled:opacity-40"
                  disabled={!canMoveDown}
                  onClick={() => {
                    setMenuOpen(false);
                    onMoveDown();
                  }}
                >
                  Move down
                </button>
                <button
                  className="block w-full px-3 py-1.5 text-left text-[var(--warn)]"
                  onClick={() => {
                    setMenuOpen(false);
                    removeExercise.mutate({ sessionId, exId: exercise.id });
                  }}
                >
                  Remove
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-2">
        <LastTimePanel last={exercise.last} imperial={imperial} onCopy={copyLast} />
      </div>

      <div className="mt-2 space-y-1.5">
        {exercise.sets.map((s) => (
          <SetEditor key={s.id} sessionId={sessionId} set={s} imperial={imperial} />
        ))}
      </div>

      <button
        onClick={addBlankSet}
        disabled={addSet.isPending}
        className="mt-2 w-full rounded-lg border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-dim)]"
      >
        ＋ Add set
      </button>

      {altOpen && (
        <AlternativesSheet
          exerciseName={exercise.name}
          catalogId={exercise.catalog_id}
          alternatives={exercise.alternatives}
          onClose={() => setAltOpen(false)}
          onSwap={(alt) => {
            patchExercise.mutate({
              sessionId,
              exId: exercise.id,
              name: alt.name,
              catalog_id: alt.catalog_id,
            });
            setAltOpen(false);
          }}
        />
      )}
    </div>
  );
}
