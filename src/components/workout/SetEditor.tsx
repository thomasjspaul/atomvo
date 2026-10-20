import { useEffect, useState } from "react";
import type { WorkoutSet } from "../../types";
import { inputToKg, weightToInput, weightUnit } from "../../lib/workout";
import { scrollFieldIntoView } from "../../lib/dom";
import { useDeleteSet, usePatchSet } from "../../lib/queries";

const RPE_OPTS = ["", "W", "<6", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10"];

export function SetEditor({
  sessionId,
  set,
  imperial,
}: {
  sessionId: string;
  set: WorkoutSet;
  imperial: boolean;
}) {
  const patch = usePatchSet();
  const del = useDeleteSet();
  const [weight, setWeight] = useState(weightToInput(set.weight_kg, imperial));
  const [reps, setReps] = useState(set.reps == null ? "" : String(set.reps));

  useEffect(() => {
    setWeight(weightToInput(set.weight_kg, imperial));
  }, [set.weight_kg, imperial]);
  useEffect(() => {
    setReps(set.reps == null ? "" : String(set.reps));
  }, [set.reps]);

  const saveWeight = () => {
    const kg = inputToKg(weight, imperial);
    if (kg === set.weight_kg || (kg == null && set.weight_kg == null)) return;
    patch.mutate({ sessionId, setId: set.id, weight_kg: kg });
  };
  const saveReps = () => {
    const n = reps.trim() === "" ? null : Math.max(0, Math.round(Number(reps)));
    if (n === set.reps) return;
    patch.mutate({ sessionId, setId: set.id, reps: n });
  };

  // Compact effort picker: "W" = warm-up, "<6" = an easy working set (stored as RPE 5).
  const rpeValue = set.is_warmup
    ? "W"
    : set.rpe == null
      ? ""
      : set.rpe <= 5
        ? "<6"
        : String(set.rpe);
  const onRpeChange = (v: string) => {
    if (v === "W") patch.mutate({ sessionId, setId: set.id, is_warmup: true, rpe: null });
    else if (v === "<6") patch.mutate({ sessionId, setId: set.id, is_warmup: false, rpe: 5 });
    else
      patch.mutate({
        sessionId,
        setId: set.id,
        is_warmup: false,
        rpe: v === "" ? null : Number(v),
      });
  };

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <button
        onClick={() =>
          patch.mutate({ sessionId, setId: set.id, is_warmup: !set.is_warmup })
        }
        className={`w-5 flex-none text-center text-[11px] ${
          set.is_warmup ? "text-[var(--text-dim)]" : "font-semibold text-[var(--text)]"
        }`}
        title={set.is_warmup ? "Warm-up set — tap to make it a working set" : "Working set — tap to mark as warm-up"}
      >
        {set.is_warmup ? "W" : set.set_number}
      </button>
      <input
        inputMode="decimal"
        value={weight}
        onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))}
        onBlur={saveWeight}
        onFocus={scrollFieldIntoView}
        placeholder="–"
        aria-label="Weight"
        className="w-16 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-center outline-none focus:border-[var(--pro)]"
      />
      <span className="text-[11px] text-[var(--text-dim)]">{weightUnit(imperial)}</span>
      <span className="text-[var(--text-dim)]">×</span>
      <input
        inputMode="numeric"
        value={reps}
        onChange={(e) => setReps(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={saveReps}
        onFocus={scrollFieldIntoView}
        placeholder="–"
        aria-label="Reps"
        className="w-12 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-center outline-none focus:border-[var(--pro)]"
      />
      <select
        value={rpeValue}
        onChange={(e) => onRpeChange(e.target.value)}
        onFocus={scrollFieldIntoView}
        aria-label="RPE"
        className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-1 py-1.5 text-xs outline-none focus:border-[var(--pro)]"
      >
        {RPE_OPTS.map((o) => (
          <option key={o} value={o}>
            {o === "" ? "RPE" : o}
          </option>
        ))}
      </select>
      <button
        onClick={() => del.mutate({ sessionId, setId: set.id })}
        className="ml-auto flex-none px-1 text-[var(--text-dim)]"
        aria-label="Delete set"
      >
        ✕
      </button>
    </div>
  );
}
