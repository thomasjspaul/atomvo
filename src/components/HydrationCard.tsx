import { useLogHydration, useDeleteHydration } from "../lib/queries";
import { Card } from "./ui";
import type { DayHydration } from "../types";

const ml = (v: number) => `${Math.round(v)} ml`;

export function HydrationCard({
  hydration,
  date,
}: {
  hydration: DayHydration;
  /** Viewed tracking date (YYYY-MM-DD); omit for today. Keeps past-day logs on that day. */
  date?: string;
}) {
  const log = useLogHydration();
  const undo = useDeleteHydration();
  const frac = hydration.target_ml
    ? Math.min(1, hydration.total_ml / hydration.target_ml)
    : 0;
  const last = hydration.entries[hydration.entries.length - 1];

  function add(volume_ml: number, kind: "water" | "caffeine") {
    // Noon local is always inside the tracking day (3 AM rollover), so it lands
    // on the day being viewed rather than "now".
    const occurred_at = date ? new Date(`${date}T12:00:00`).toISOString() : undefined;
    log.mutate({ volume_ml, kind, occurred_at });
  }
  function custom(kind: "water" | "caffeine") {
    const raw = window.prompt(kind === "caffeine" ? "Coffee / tea — how many ml?" : "How many ml?");
    if (!raw) return;
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) add(Math.round(n), kind);
  }

  const btn =
    "rounded-xl border border-[var(--border)] bg-[var(--surface-2)] py-2 text-sm active:brightness-95 disabled:opacity-50";

  return (
    <Card className="mb-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium">Water</span>
        <span className="text-xs text-[var(--text-dim)]">
          {ml(hydration.total_ml)} / {ml(hydration.target_ml)}
        </span>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div
          className="h-full rounded-full bg-[var(--cal)] transition-[width] duration-300"
          style={{ width: `${frac * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button className={btn} disabled={log.isPending} onClick={() => add(250, "water")}>
          +250 ml
        </button>
        <button className={btn} disabled={log.isPending} onClick={() => add(500, "water")}>
          +500 ml
        </button>
        <button className={btn} disabled={log.isPending} onClick={() => custom("water")}>
          +…
        </button>
        <button
          className={`${btn} col-span-2`}
          disabled={log.isPending}
          onClick={() => add(250, "caffeine")}
        >
          ☕ Coffee / tea +250 ml
        </button>
        <button className={btn} disabled={log.isPending} onClick={() => custom("caffeine")}>
          ☕ …
        </button>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--text-dim)]">
        <span>caffeinated drinks count 80%</span>
        {last && (
          <button onClick={() => undo.mutate(last.id)} disabled={undo.isPending}>
            undo {last.kind === "caffeine" ? "☕ " : ""}(−{ml(last.ml)})
          </button>
        )}
      </div>
    </Card>
  );
}
