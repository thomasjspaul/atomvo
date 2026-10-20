import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, Sheet, Spinner, TextInput } from "../ui";
import { WorkoutSessionView } from "./WorkoutSessionView";
import { ExportSheet } from "./ExportSheet";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import {
  useExerciseProgress,
  useExerciseSearch,
  useWorkoutHistory,
  useWorkoutSession,
} from "../../lib/queries";
import { displayKgNum, weightUnit } from "../../lib/workout";
import { relativeDay } from "../../lib/format";
import { todayISO } from "../../lib/day";
import type { ExerciseProgressRow } from "../../types";

const RANGES = [
  { days: 90, label: "90d" },
  { days: 180, label: "6mo" },
  { days: 365, label: "1y" },
];

export function GymProgressCard({ imperial }: { imperial: boolean }) {
  const [days, setDays] = useState(90);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const debounced = useDebouncedValue(query.trim(), 250);
  const search = useExerciseSearch(debounced, days);
  const history = useWorkoutHistory(undefined, undefined, 6);
  const results = search.data?.results ?? [];

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Gym</h2>
        <div className="flex gap-1 rounded-lg bg-[var(--surface-2)] p-0.5 text-[11px]">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`rounded px-2 py-0.5 ${
                days === r.days ? "bg-[var(--surface)] font-medium" : "text-[var(--text-dim)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <TextInput
        placeholder="Search exercises…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {search.isFetching && <p className="text-[11px] text-[var(--text-dim)]">Searching…</p>}

      {!search.isFetching && results.length === 0 && (
        <p className="text-[11px] text-[var(--text-dim)]">
          {debounced ? "No matching exercises logged." : "No gym data in this range yet."}
        </p>
      )}

      <div className="space-y-1.5">
        {results.map((row) => (
          <ExerciseRow
            key={row.norm_name}
            row={row}
            imperial={imperial}
            days={days}
            open={openId === row.norm_name}
            onToggle={() =>
              setOpenId(openId === row.norm_name ? null : row.norm_name)
            }
          />
        ))}
      </div>

      {(history.data?.sessions.length ?? 0) > 0 && (
        <div>
          <div className="mb-1 mt-1 text-[11px] font-medium uppercase text-[var(--text-dim)]">
            Recent workouts
          </div>
          <div className="space-y-1">
            {history.data!.sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setViewingId(s.id)}
                className="flex w-full items-center justify-between rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-left text-xs"
              >
                <span>
                  {relativeDay(s.tracking_date, todayISO())}
                  {s.title ? ` · ${s.title}` : ""}
                </span>
                <span className="text-[var(--text-dim)]">
                  {s.exercise_count} ex · {s.set_count} sets
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setExportOpen(true)}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] py-1.5 text-xs"
      >
        Export…
      </button>

      {viewingId && (
        <SessionViewSheet
          sessionId={viewingId}
          imperial={imperial}
          onClose={() => setViewingId(null)}
        />
      )}
      {exportOpen && <ExportSheet onClose={() => setExportOpen(false)} />}
    </Card>
  );
}

function ExerciseRow({
  row,
  imperial,
  days,
  open,
  onToggle,
}: {
  row: ExerciseProgressRow;
  imperial: boolean;
  days: number;
  open: boolean;
  onToggle: () => void;
}) {
  const u = weightUnit(imperial);
  return (
    <div className="rounded-lg border border-[var(--border)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm"
      >
        <span className="min-w-0 truncate">{row.canonical_name}</span>
        <span className="flex-none text-[11px] text-[var(--text-dim)]">
          {row.top_weight_kg != null &&
            `${displayKgNum(row.top_weight_kg, imperial)}${u} · `}
          {row.sessions}×{" "}
          {row.last_done ? relativeDay(row.last_done, todayISO()) : ""}
        </span>
      </button>
      {open && <ProgressChart row={row} imperial={imperial} days={days} />}
    </div>
  );
}

function ProgressChart({
  row,
  imperial,
  days,
}: {
  row: ExerciseProgressRow;
  imperial: boolean;
  days: number;
}) {
  const q = useExerciseProgress(row.canonical_name, row.catalog_id, days);
  const points = (q.data?.points ?? []).map((p) => ({
    date: p.date.slice(5),
    weight: p.top_weight_kg == null ? null : displayKgNum(p.top_weight_kg, imperial),
    e1rm: p.top_est_1rm == null ? null : displayKgNum(p.top_est_1rm, imperial),
  }));

  if (q.isLoading) {
    return (
      <div className="px-2.5 py-4 text-center">
        <Spinner />
      </div>
    );
  }
  if (points.length < 2) {
    return (
      <p className="px-2.5 pb-2 text-[11px] text-[var(--text-dim)]">
        Need at least two sessions in range to chart a trend.
      </p>
    );
  }

  return (
    <div className="px-1 pb-2">
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--text-dim)" />
          <YAxis tick={{ fontSize: 10 }} stroke="var(--text-dim)" width={40} />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="weight"
            name={`Top set (${weightUnit(imperial)})`}
            stroke="var(--pro)"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="e1rm"
            name={`Est 1RM (${weightUnit(imperial)})`}
            stroke="var(--cal)"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SessionViewSheet({
  sessionId,
  imperial,
  onClose,
}: {
  sessionId: string;
  imperial: boolean;
  onClose: () => void;
}) {
  const q = useWorkoutSession(sessionId);
  return (
    <Sheet open onClose={onClose} title="Workout">
      {q.isLoading || !q.data ? (
        <div className="py-6 text-center">
          <Spinner />
        </div>
      ) : (
        <WorkoutSessionView session={q.data} imperial={imperial} />
      )}
    </Sheet>
  );
}
