import { useEffect, useState } from "react";
import type { WorkoutSessionDetail } from "../../types";
import { Button } from "../ui";
import { ExerciseCard } from "./ExerciseCard";
import { ExerciseSearchSheet } from "./ExerciseSearchSheet";
import {
  useAddSessionExercise,
  useDeleteSessionExercise,
  useDeleteWorkout,
  usePatchSessionExercise,
  usePatchWorkout,
} from "../../lib/queries";
import { todayISO } from "../../lib/day";

// Post-hoc editing of a workout that's already been saved (active or
// finished): rename (the title was AI-generated on finish), re-date, and
// fix up exercises and sets.
export function EditSessionView({
  session,
  imperial,
  onDone,
  onDeleted,
}: {
  session: WorkoutSessionDetail;
  imperial: boolean;
  onDone: () => void;
  onDeleted: () => void;
}) {
  const addExercise = useAddSessionExercise();
  const patchExercise = usePatchSessionExercise();
  const removeExercise = useDeleteSessionExercise();
  const patchWorkout = usePatchWorkout();
  const deleteWorkout = useDeleteWorkout();

  const [searchOpen, setSearchOpen] = useState(false);
  const [title, setTitle] = useState(session.title ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setTitle(session.title ?? ""), [session.title]);
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const saveTitle = () => {
    if (title.trim() === (session.title ?? "")) return;
    patchWorkout.mutate({ id: session.id, title: title.trim() || null });
  };

  const move = (from: number, to: number) => {
    const arr = [...session.exercises];
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    arr.forEach((ex, i) => {
      if (ex.position !== i)
        patchExercise.mutate({ sessionId: session.id, exId: ex.id, position: i });
    });
  };

  const finishEditing = () => {
    // An exercise added while editing but never given a set wasn't performed
    // — drop it rather than leave it cluttering the saved workout.
    for (const ex of session.exercises) {
      if (ex.sets.length === 0) removeExercise.mutate({ sessionId: session.id, exId: ex.id });
    }
    onDone();
  };

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-30 -mx-4 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-2">
        {confirmDelete ? (
          <Button
            variant="danger"
            className="px-3 py-1.5 text-xs"
            onClick={() => deleteWorkout.mutate(session.id, { onSuccess: onDeleted })}
          >
            Confirm delete
          </Button>
        ) : (
          <Button
            variant="subtle"
            className="px-3 py-1.5 text-xs"
            onClick={() => setConfirmDelete(true)}
          >
            Delete workout
          </Button>
        )}
        <Button className="ml-auto px-4 py-1.5 text-xs" onClick={finishEditing}>
          Done
        </Button>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          placeholder="Workout name (optional)"
          className="w-full bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-[var(--text-dim)]"
        />
        <input
          type="date"
          aria-label="Workout date"
          value={session.tracking_date}
          max={todayISO()}
          onChange={(e) =>
            e.target.value &&
            patchWorkout.mutate({ id: session.id, tracking_date: e.target.value })
          }
          className="mt-1 bg-transparent text-[11px] text-[var(--text-dim)] outline-none"
        />
      </div>

      {session.exercises.map((ex, i) => (
        <ExerciseCard
          key={ex.id}
          sessionId={session.id}
          exercise={ex}
          imperial={imperial}
          canMoveUp={i > 0}
          canMoveDown={i < session.exercises.length - 1}
          onMoveUp={() => move(i, i - 1)}
          onMoveDown={() => move(i, i + 1)}
        />
      ))}

      {session.exercises.length === 0 && (
        <p className="rounded-xl border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--text-dim)]">
          No exercises logged.
        </p>
      )}

      <Button variant="subtle" className="w-full" onClick={() => setSearchOpen(true)}>
        ＋ Add exercise
      </Button>

      {searchOpen && (
        <ExerciseSearchSheet
          addedNames={session.exercises.map((e) => e.name)}
          onClose={() => setSearchOpen(false)}
          onAdd={(payload) =>
            addExercise.mutate({
              sessionId: session.id,
              name: payload.name,
              catalog_id: payload.catalog_id ?? undefined,
            })
          }
        />
      )}
    </div>
  );
}
