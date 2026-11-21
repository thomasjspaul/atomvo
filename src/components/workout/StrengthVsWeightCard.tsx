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
import { Button, Card, Sheet, Spinner } from "../ui";
import {
  useInsights,
  useKeyLifts,
  useSetKeyLifts,
  useStrengthPoints,
  type InsightRange,
} from "../../lib/queries";
import {
  CONSISTENT_SHARE,
  liftChanges,
  liftConsistency,
  rpeCoverage,
  trendChange,
  weeklyRows,
  type LiftConsistency,
} from "../../lib/strength";

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
  const keyLifts = useKeyLifts();
  const [picking, setPicking] = useState(false);

  const allPoints = strength.data?.points;
  const consistency = useMemo(() => (allPoints ? liftConsistency(allPoints) : []), [allPoints]);
  const saved = keyLifts.data?.lifts ?? null;
  // Default: every lift. A saved pick overrides it.
  const chosen = saved;
  const points = useMemo(() => {
    if (!allPoints) return undefined;
    if (!chosen) return allPoints;
    const keep = new Set(chosen);
    return allPoints.filter((p) => keep.has(p.norm_name));
  }, [allPoints, chosen]);
  const usedCount = new Set((points ?? []).map((p) => p.norm_name)).size;
  const body = insights.data?.body;
  const rows = useMemo(() => (points && body ? weeklyRows(points, body) : []), [points, body]);
  const lifts = useMemo(() => (points ? liftChanges(points) : []), [points]);
  const rpe = useMemo(() => (points ? rpeCoverage(points) : { rated: 0, total: 0 }), [points]);

  const s = trendChange(rows, "strength");
  const w = trendChange(rows, "weight");
  const l = trendChange(rows, "lean");
  const rel = s != null && w != null ? ((1 + s / 100) / (1 + w / 100) - 1) * 100 : null;
  const hasLean = rows.some((r) => r.lean != null);
  const chart = rows.map((r) => ({ ...r, date: fmtDate(r.week) }));
  const loading = strength.isLoading || insights.isLoading || keyLifts.isLoading;
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

      {!loading && consistency.length > 0 && (
        <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-dim)]">
          <span>
            {usedCount} lift{usedCount === 1 ? "" : "s"}
            {saved ? " you picked" : " — all of them"}
          </span>
          <button className="shrink-0 underline" onClick={() => setPicking(true)}>
            Choose lifts
          </button>
        </div>
      )}

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
            Only the lifts above count. Strength = estimated 1-rep max of your best set (up to 12
            reps), each lift compared with its own previous session and averaged across lifts, so
            new or dropped exercises don’t skew it. When a session has an RPE (6–10) on the top
            set, reps left in the tank count too
            {rpe.total > 0 && ` (${Math.round((rpe.rated / rpe.total) * 100)}% of sessions here)`};
            when it’s missing, that lift’s usual effort is assumed, so a forgotten RPE doesn’t
            create a fake jump. All lines
            are % change from the same starting week; headline numbers come from the trend, not the
            last week.
          </p>
        </>
      )}
      {picking && (
        <LiftPicker
          consistency={consistency}
          initial={chosen ?? consistency.map((c) => c.name)}
          isAll={!saved}
          onClose={() => setPicking(false)}
        />
      )}
    </Card>
  );
}

/** Pick the lifts for the index; sorted most consistent first. */
function LiftPicker({
  consistency,
  initial,
  isAll,
  onClose,
}: {
  consistency: LiftConsistency[];
  initial: string[];
  isAll: boolean;
  onClose: () => void;
}) {
  const save = useSetKeyLifts();
  const [sel, setSel] = useState(() => new Set(initial));
  const toggle = (n: string) =>
    setSel((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  const commit = async (lifts: string[] | null) => {
    await save.mutateAsync(lifts);
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title="Lifts for the strength index">
      <p className="mb-3 text-xs text-[var(--text-dim)]">
        Most consistent first: how many of your training weeks in this range included each lift.
        Pick the ones you do regularly; occasional lifts add noise. Your pick applies to every
        range, and “Use all lifts” goes back to counting everything.
      </p>
      <div className="mb-4 space-y-1">
        {consistency.map((c) => (
          <label
            key={c.name}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-2)]"
          >
            <input type="checkbox" checked={sel.has(c.name)} onChange={() => toggle(c.name)} />
            <span className="flex-1 text-sm">{titleCase(c.name)}</span>
            <span
              className="text-xs"
              style={{ color: c.share >= CONSISTENT_SHARE ? "var(--good)" : "var(--text-dim)" }}
            >
              {c.weeks}/{c.ofWeeks} wks · {c.sessions}×
            </span>
          </label>
        ))}
      </div>
      {save.isError && (
        <p className="mb-2 text-[11px] text-[var(--warn)]">
          Couldn’t save: {(save.error as Error).message}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={sel.size === 0 || save.isPending}
          onClick={() => commit([...sel])}
        >
          {save.isPending ? <Spinner /> : `Use ${sel.size} lift${sel.size === 1 ? "" : "s"}`}
        </Button>
        <Button
          variant="subtle"
          disabled={save.isPending || isAll}
          onClick={() => commit(null)}
        >
          Use all lifts
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-dim)]">
        Green = done in at least {CONSISTENT_SHARE * 100}% of your training weeks.
      </p>
    </Sheet>
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
