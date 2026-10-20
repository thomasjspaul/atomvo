import { useState } from "react";
import { Card, Spinner } from "../ui";
import { useMuscleBalance } from "../../lib/queries";
import { MUSCLE_GROUPS } from "../../lib/workout";

const RANGES = [30, 90, 120];

const label = (m: string) => m[0].toUpperCase() + m.slice(1);

/**
 * Exercises logged per primary muscle over a look-back window, as horizontal
 * bars. The dashed tick is the average across groups; groups under half of it
 * are tinted so lagging muscles are easy to spot.
 */
export function MuscleBalanceCard() {
  const [days, setDays] = useState(30);
  const q = useMuscleBalance(days);
  const data = q.data;

  const byMuscle = new Map((data?.muscles ?? []).map((m) => [m.muscle, m]));
  const rows = MUSCLE_GROUPS.filter((m) => m !== "cardio").map((m) => ({
    muscle: m,
    exercises: byMuscle.get(m)?.exercises ?? 0,
    sets: byMuscle.get(m)?.sets ?? 0,
  }));
  const max = Math.max(1, ...rows.map((r) => r.exercises));
  const avg = rows.reduce((a, r) => a + r.exercises, 0) / rows.length;
  const total = rows.reduce((a, r) => a + r.exercises, 0);

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Muscle balance</h2>
        <div className="flex gap-1 rounded-lg bg-[var(--surface-2)] p-0.5 text-[11px]">
          {RANGES.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded px-2 py-0.5 ${
                days === d ? "bg-[var(--surface)] font-medium" : "text-[var(--text-dim)]"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="py-6 text-center text-[var(--text-dim)]">
          <Spinner />
        </div>
      ) : total === 0 ? (
        <p className="text-[11px] text-[var(--text-dim)]">
          No finished workouts in the last {days} days.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            {rows.map((r) => {
              const low = r.exercises < avg / 2;
              return (
                <div key={r.muscle} className="flex items-center gap-2 text-xs">
                  <span className="w-20 flex-none">{label(r.muscle)}</span>
                  <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(r.exercises / max) * 100}%`,
                        background: low ? "var(--warn)" : "var(--pro)",
                      }}
                    />
                    <div
                      className="absolute inset-y-0 border-l border-dashed border-[var(--text-dim)]"
                      style={{ left: `${(avg / max) * 100}%` }}
                    />
                  </div>
                  <span
                    className={`w-14 flex-none text-right tabular-nums ${
                      r.exercises === 0 ? "text-[var(--warn)]" : ""
                    }`}
                  >
                    {r.exercises}
                    <span className="text-[10px] text-[var(--text-dim)]"> · {r.sets}s</span>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] leading-snug text-[var(--text-dim)]">
            Exercises · working sets per primary muscle. Dashed line = average; amber = under
            half of it.
            {data.cardio.exercises > 0 && ` Cardio: ${data.cardio.exercises}.`}
            {data.unclassified.exercises > 0 &&
              ` ${data.unclassified.exercises} exercise${
                data.unclassified.exercises === 1 ? "" : "s"
              } without a known muscle not counted.`}
          </p>
        </>
      )}
    </Card>
  );
}
