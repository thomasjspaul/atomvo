import { useState } from "react";
import { Link } from "react-router-dom";
import { useDay, useSettings } from "../lib/queries";
import { Ring } from "../components/Ring";
import { EntryRow } from "../components/EntryRow";
import { CoachBubble } from "../components/CoachBubble";
import { HydrationCard } from "../components/HydrationCard";
import { Card, EmptyState } from "../components/ui";
import { EntryEditor } from "./EntryEditor";
import type { Entry } from "../types";
import { addDaysISO, todayISO } from "../lib/day";
import { syncedAt } from "../lib/format";

export function Today() {
  const [date, setDate] = useState(todayISO());
  const day = useDay(date === todayISO() ? undefined : date);
  const settings = useSettings();
  const [editing, setEditing] = useState<Entry | null>(null);

  const isToday = date === todayISO();
  const focus = settings.data?.settings.focus_mode ?? false;

  const entries = day.data
    ? [...day.data.entries].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    : [];
  const latestCoach = day.data?.coach_messages.at(-1) ?? null;

  const totals = day.data?.totals;
  const target = day.data?.target;

  return (
    <>
      <header className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setDate(addDaysISO(date, -1))}
          className="px-2 py-1 text-[var(--text-dim)]"
          aria-label="Previous day"
        >
          ‹
        </button>
        <div className="text-center">
          <div className="text-lg font-semibold">{isToday ? "Today" : formatDate(date)}</div>
          {!isToday && <div className="text-[11px] text-[var(--text-dim)]">{date}</div>}
        </div>
        <button
          onClick={() => setDate(addDaysISO(date, 1))}
          disabled={isToday}
          className="px-2 py-1 text-[var(--text-dim)] disabled:opacity-30"
          aria-label="Next day"
        >
          ›
        </button>
      </header>

      <div className="mb-3 flex justify-end">
        <Link to="/history" className="text-xs text-[var(--text-dim)] underline">
          View past days →
        </Link>
      </div>

      {!target && (
        <Link
          to="/settings"
          className="mb-3 block rounded-xl border border-dashed border-[var(--border)] p-3 text-center text-sm text-[var(--text-dim)]"
        >
          No target yet — add your profile in Settings to get calorie &amp; protein targets →
        </Link>
      )}

      <Card className="mb-4">
        <div className={`flex justify-around ${focus ? "" : "gap-2"}`}>
          {!focus && (
            <Ring
              value={totals?.calories ?? 0}
              target={target?.calorie_target ?? 0}
              label="Calories"
              unit="kcal"
              color="var(--cal)"
            />
          )}
          <Ring
            value={totals?.protein_g ?? 0}
            target={target?.protein_target_g ?? 0}
            label="Protein"
            unit="g"
            color="var(--pro)"
          />
        </div>
        {!focus && (
          <div className="mt-3 flex justify-center gap-6 text-center text-xs text-[var(--text-dim)]">
            <div>
              <div className="text-sm font-medium text-[var(--text)]">
                {Math.round(totals?.carbs_g ?? 0)}g
              </div>
              carbs
            </div>
            <div>
              <div className="text-sm font-medium text-[var(--text)]">
                {Math.round(totals?.fat_g ?? 0)}g
              </div>
              fat
            </div>
            {isToday && (
              <div>
                <div className="text-sm font-medium text-[var(--text)]">
                  {day.data ? day.data.hours_left_in_day : "–"}h
                </div>
                left today
              </div>
            )}
          </div>
        )}
        {!focus && day.data?.energy && (
          <div className="mt-2 border-t border-[var(--border)] pt-2">
            <div className="flex justify-center gap-6 text-center text-xs text-[var(--text-dim)]">
              <div>
                <div className="text-sm font-medium text-[var(--text)]">
                  {day.data.energy.burned_kcal}
                  {day.data.energy.basis === "estimated" && "*"}
                </div>
                burned
              </div>
              {(totals?.calories ?? 0) > 0 && day.data.energy.net_kcal != null && (
                <div>
                  <div className="text-sm font-medium text-[var(--text)]">
                    {day.data.energy.net_kcal >= 0 ? "+" : ""}
                    {day.data.energy.net_kcal}
                  </div>
                  net kcal
                </div>
              )}
              {day.data.energy.steps != null && (
                <div>
                  <div className="text-sm font-medium text-[var(--text)]">
                    {day.data.energy.steps.toLocaleString()}
                  </div>
                  steps
                </div>
              )}
            </div>
            <div className="mt-1 text-center text-[10px] text-[var(--text-dim)]">
              {day.data.energy.basis === "estimated"
                ? "* no activity synced — burn assumed = BMR"
                : day.data.energy.updated_at
                  ? `synced ${syncedAt(day.data.energy.updated_at)}`
                  : null}
            </div>
          </div>
        )}
      </Card>

      {!focus && day.data?.hydration && (
        <HydrationCard hydration={day.data.hydration} date={isToday ? undefined : date} />
      )}

      {latestCoach && (
        <div className="mb-4">
          <CoachBubble msg={latestCoach} />
        </div>
      )}

      <div className="space-y-2.5">
        {entries.length === 0 && !day.isLoading && (
          <EmptyState>Nothing logged yet. Tap ＋ Log meal to start.</EmptyState>
        )}
        {entries.map((e) => (
          <EntryRow key={e.id} entry={e} onClick={() => setEditing(e)} />
        ))}
      </div>

      <EntryEditor entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
