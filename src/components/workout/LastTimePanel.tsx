import { useState } from "react";
import type { LastExercisePerformance } from "../../types";
import { displayKg, groupedSummary, setSummary, weightUnit } from "../../lib/workout";
import { relativeDay } from "../../lib/format";
import { todayISO } from "../../lib/day";

export function LastTimePanel({
  last,
  imperial,
  onCopy,
}: {
  last: LastExercisePerformance | null;
  imperial: boolean;
  onCopy: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!last) {
    return (
      <p className="px-0.5 text-[11px] text-[var(--text-dim)]">
        No previous record for this exercise.
      </p>
    );
  }

  const working = last.sets.filter((s) => !s.is_warmup);
  return (
    <div className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-[11px] text-[var(--text-dim)]">
      <button
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="min-w-0 truncate">
          <span className="font-medium text-[var(--text)]">
            {relativeDay(last.tracking_date, todayISO())}
          </span>{" "}
          · {groupedSummary(last.sets, imperial)}
          {last.est_1rm != null &&
            ` · e1RM ${displayKg(last.est_1rm, imperial)}${weightUnit(imperial)}`}
        </span>
        <span className="flex-none">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-0.5">
          {last.sets.map((s) => (
            <div key={s.set_number}>
              {s.is_warmup ? "W" : s.set_number}. {setSummary(s, imperial)}
            </div>
          ))}
          {working.length > 0 && (
            <button
              onClick={onCopy}
              className="mt-1 rounded border border-[var(--border)] px-2 py-0.5 text-[var(--text)]"
            >
              Copy {working.length} set{working.length === 1 ? "" : "s"} to today
            </button>
          )}
        </div>
      )}
    </div>
  );
}
