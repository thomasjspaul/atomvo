import type { Entry } from "../types";
import { timeOfDay } from "../lib/format";

export function EntryRow({ entry, onClick }: { entry: Entry; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 text-left active:brightness-95"
    >
      {entry.photo_url ? (
        <img
          src={entry.photo_url}
          alt=""
          className="h-12 w-12 flex-none rounded-lg object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-lg bg-[var(--surface-2)] text-lg">
          {entry.source === "favourite"
            ? "★"
            : entry.source === "photo"
              ? "📷"
              : entry.source === "barcode"
                ? "▮"
                : "✎"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{entry.title || "Meal"}</span>
          {entry.edited && <span className="text-[10px] text-[var(--text-dim)]">edited</span>}
        </div>
        <div className="text-xs text-[var(--text-dim)]">
          {timeOfDay(entry.occurred_at)} · {Math.round(entry.calories)} kcal ·{" "}
          <span className="text-[var(--pro)]">{Math.round(entry.protein_g)}g P</span> ·{" "}
          {Math.round(entry.carbs_g)}g C · {Math.round(entry.fat_g)}g F
          {entry.creatine_g ? ` · ${entry.creatine_g}g creatine` : ""}
        </div>
      </div>
      {entry.confidence != null && entry.confidence < 0.5 && (
        <span className="flex-none text-[10px] text-[var(--warn)]">low&nbsp;conf</span>
      )}
    </button>
  );
}
