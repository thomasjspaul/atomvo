import { useEffect, useState } from "react";
import type { WorkoutSessionDetail } from "../../types";
import { Button } from "../ui";
import { ExerciseCard } from "./ExerciseCard";
import { ExerciseSearchSheet } from "./ExerciseSearchSheet";
import {
  useAddSessionExercise,
  useDeleteWorkout,
  useFinishWorkout,
  usePatchSessionExercise,
  usePatchWorkout,
  useWorkoutTemplates,
} from "../../lib/queries";
import { todayISO } from "../../lib/day";

function elapsed(fromISO: string): string {
  const min = Math.max(0, Math.floor((Date.now() - Date.parse(fromISO)) / 60000));
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}h ${min % 60}m` : `${min}m`;
}

export function ActiveSessionView({
  session,
  imperial,
}: {
  session: WorkoutSessionDetail;
  imperial: boolean;
}) {
  const addExercise = useAddSessionExercise();
  const patchExercise = usePatchSessionExercise();
  const patchWorkout = usePatchWorkout();
  const finish = useFinishWorkout();
  const discard = useDeleteWorkout();
  const templates = useWorkoutTemplates();

  const addedNorms = new Set(session.exercises.map((e) => e.norm_name));
  const planPicks = (
    templates.data?.templates.find((t) => t.id === session.template_id)?.items ?? []
  )
    .filter((it) => !addedNorms.has(it.norm_name))
    .map((it) => ({ name: it.name, catalog_id: it.catalog_id }));

  const [searchOpen, setSearchOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!confirmDiscard) return;
    const t = setTimeout(() => setConfirmDiscard(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDiscard]);

  const today = todayISO();
  const backdated = session.tracking_date !== today;

  const move = (from: number, to: number) => {
    const arr = [...session.exercises];
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    arr.forEach((ex, i) => {
      if (ex.position !== i)
        patchExercise.mutate({ sessionId: session.id, exId: ex.id, position: i });
    });
  };

  return (
    <div className="space-y-3">
      {/* Stays reachable while scrolling the exercise list so finishing or
          checking elapsed time never means scrolling back to the top. */}
      <div className="top-safe sticky z-30 -mx-4 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-2">
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-dim)]">
          {backdated ? "Past workout" : elapsed(session.started_at)}
        </span>
        {confirmDiscard ? (
          <Button
            variant="danger"
            className="px-3 py-1.5 text-xs"
            onClick={() => discard.mutate(session.id)}
          >
            Confirm discard
          </Button>
        ) : (
          <Button
            variant="subtle"
            className="px-3 py-1.5 text-xs"
            onClick={() => setConfirmDiscard(true)}
          >
            Discard
          </Button>
        )}
        <Button
          className="px-4 py-1.5 text-xs"
          onClick={() => finish.mutate(session.id)}
          disabled={finish.isPending}
        >
          Finish
        </Button>
      </div>

      {/* No name to fill in — the title is generated from the exercises on Finish. */}
      <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
        <span className="text-[var(--text-dim)]">Date</span>
        <input
          type="date"
          value={session.tracking_date}
          max={today}
          onChange={(e) =>
            e.target.value &&
            patchWorkout.mutate({ id: session.id, tracking_date: e.target.value })
          }
          className="bg-transparent text-right outline-none"
        />
      </label>

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
          No exercises yet — add your first below.
        </p>
      )}

      <Button variant="subtle" className="w-full" onClick={() => setSearchOpen(true)}>
        ＋ Add exercise
      </Button>

      {searchOpen && (
        <ExerciseSearchSheet
          planPicks={planPicks}
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
