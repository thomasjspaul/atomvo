import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, Spinner } from "../ui";
import { useInsights, useStrengthPoints, type InsightRange } from "../../lib/queries";
import { liftChanges, trendChange, weeklyRows } from "../../lib/strength";

const RANGES: { key: InsightRange; label: string }[] = [
  { key: "90", label: "90d" },
  { key: "180", label: "6mo" },
  { key: "365", label: "1y" },
  { key: "all", label: "All" },
];
const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
};
const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Strength (all lifts, chained) next to body weight and lean mass, each as % change from
 * the same starting week — is strength keeping up with the weight you're adding?
 */
export function StrengthVsWeightCard() {
  const [range, setRange] = useState<InsightRange>("180");
  const strength = useStrengthPoints(range);
  const insights = useInsights(range);

  const points = strength.data?.points;
  const body = insights.data?.body;
  const rows = useMemo(() => (points && body ? weeklyRows(points, body) : []), [points, body]);
  const lifts = useMemo(() => (points ? liftChanges(points) : []), [points]);

  const s = trendChange(rows, "strength");
  const w = trendChange(rows, "weight");
  const l = trendChange(rows, "lean");
  const rel = s != null && w != null ? ((1 + s / 100) / (1 + w / 100) - 1) * 100 : null;
  const hasLean = rows.some((r) => r.lean != null);
  const chart = rows.map((r) => ({ ...r, date: fmtDate(r.week) }));
  const loading = strength.isLoading || insights.isLoading;
  const up = lifts.filter((x) => x.pct > 0).length;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Strength vs body weight</h2>
        <div className="flex gap-1 rounded-lg bg-[var(--surface-2)] p-0.5 text-[11px]">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded px-2 py-0.5 ${
                range === r.key ? "bg-[var(--surface)] font-medium" : "text-[var(--text-dim)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center">
          <Spinner />
        </div>
      ) : rows.length < 3 || s == null ? (
        <p className="py-4 text-center text-xs text-[var(--text-dim)]">
          Needs a few weeks of logged lifts (repeated exercises with weight and reps) and scale
          readings in this range.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="strength" color="var(--pro)" value={signed(s)} />
            <Stat label="body weight" color="var(--text)" value={w == null ? "—" : signed(w)} />
            <Stat label="lean mass" color="var(--cal)" value={l == null ? "—" : signed(l)} />
          </div>
          {rel != null && (
            <p className="text-xs">
              <span
                className="font-medium"
                style={{ color: rel >= 0 ? "var(--good)" : "var(--warn)" }}
              >
                Strength relative to body weight {signed(rel)}
              </span>
              <span className="text-[var(--text-dim)]">
                {rel >= 0
                  ? " — strength is outpacing the scale, so the weight you’re adding is working for you."
                  : " — the scale is outpacing strength; some of the gain isn’t helping you lift."}
              </span>
            </p>
          )}

          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={chart} margin={{ top: 6, right: 6, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-dim)" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-dim)" }} width={34} unit="%" />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v, name) => [`${Number(v) >= 0 ? "+" : ""}${v}%`, name]}
              />
              <Line name="strength" dataKey="strength" stroke="var(--pro)" dot={false} strokeWidth={2} connectNulls />
              <Line name="body weight" dataKey="weight" stroke="var(--text)" dot={false} strokeWidth={1.5} connectNulls />
              {hasLean && (
                <Line name="lean mass" dataKey="lean" stroke="var(--cal)" dot={false} strokeWidth={1.5} strokeDasharray="4 3" connectNulls />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex gap-4 text-[11px] text-[var(--text-dim)]">
            <span><span style={{ color: "var(--pro)" }}>▬</span> strength</span>
            <span><span style={{ color: "var(--text)" }}>▬</span> body weight</span>
            {hasLean && <span><span style={{ color: "var(--cal)" }}>▬</span> lean mass</span>}
          </div>

          {lifts.length > 0 && (
            <div>
              <div className="mb-1 text-xs text-[var(--text-dim)]">
                {up} of {lifts.length} lifts trending up
              </div>
              <div className="space-y-0.5 text-xs">
                {lifts.slice(0, 6).map((x) => (
                  <div key={x.name} className="flex justify-between">
                    <span>
                      {titleCase(x.name)}{" "}
                      <span className="text-[var(--text-dim)]">· {x.sessions} sessions</span>
                    </span>
                    <span style={{ color: x.pct >= 0 ? "var(--good)" : "var(--warn)" }}>{signed(x.pct)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-[var(--text-dim)]">
            Strength = estimated 1-rep max of your best set (up to 12 reps), each lift compared with
            its own previous session and averaged across lifts, so new or dropped exercises don’t
            skew it. All lines are % change from the same starting week; headline numbers come
            from the trend, not the last week.
          </p>
        </>
      )}
    </Card>
  );
}

function Stat({ label, color, value }: { label: string; color: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-semibold" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] text-[var(--text-dim)]">{label}</div>
    </div>
  );
}
