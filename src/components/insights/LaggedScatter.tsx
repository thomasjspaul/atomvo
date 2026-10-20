import { useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "../ui";
import {
  MIN_PAIRS,
  NUTRITION_METRICS,
  correlationCaption,
  linfit,
  type Metric,
  type NutritionKey,
  type PairedDay,
  type WhoopKey,
} from "../../lib/insights";

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
};

const selectCls =
  "rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs outline-none";

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const show = (v: number | null, digits = 0) => (v == null ? "—" : v.toFixed(digits));

type Point = { x: number; y: number; p: PairedDay };

/** Scatter of a nutrition metric (day N) vs a WHOOP metric (day N+1). */
export function LaggedScatter({
  paired,
  whoopMetrics,
}: {
  paired: PairedDay[];
  whoopMetrics: Metric<WhoopKey>[];
}) {
  const [xKey, setXKey] = useState<NutritionKey>("calories");
  const [yKey, setYKey] = useState<WhoopKey>(whoopMetrics[0].key);

  const xM = NUTRITION_METRICS.find((m) => m.key === xKey)!;
  const yM = whoopMetrics.find((m) => m.key === yKey) ?? whoopMetrics[0];

  const points: Point[] = paired
    .map((p) => ({ x: p[xKey], y: p[yKey], p }))
    .filter((pt): pt is Point => pt.x != null && pt.y != null);

  const fit = points.length >= MIN_PAIRS ? linfit(points) : null;
  const xs = points.map((pt) => pt.x);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const trend =
    fit && points.length >= 2
      ? [
          { x: xmin, y: fit.slope * xmin + fit.intercept },
          { x: xmax, y: fit.slope * xmax + fit.intercept },
        ]
      : null;

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          {xM.label} vs Next-Day {yM.label}
        </h2>
        <div className="flex gap-1.5">
          <select
            className={selectCls}
            value={xKey}
            onChange={(e) => setXKey(e.target.value as NutritionKey)}
          >
            {NUTRITION_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          {whoopMetrics.length > 1 && (
            <select
              className={selectCls}
              value={yKey}
              onChange={(e) => setYKey(e.target.value as WhoopKey)}
            >
              {whoopMetrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {points.length === 0 ? (
        <p className="py-6 text-center text-xs text-[var(--text-dim)]">
          No paired days in this range yet.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart margin={{ top: 6, right: 10, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--border)" />
            <XAxis
              type="number"
              dataKey="x"
              name={xM.label}
              tick={{ fontSize: 10, fill: "var(--text-dim)" }}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${Math.round(v)}`}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yM.label}
              width={36}
              tick={{ fontSize: 10, fill: "var(--text-dim)" }}
              domain={yKey === "recovery_pct" ? [0, 100] : ["dataMin - 5", "dataMax + 5"]}
            />
            <Tooltip contentStyle={tooltipStyle} content={<PairTooltip xM={xM} />} />
            {trend && (
              <ReferenceLine
                ifOverflow="extendDomain"
                stroke="var(--text-dim)"
                strokeDasharray="4 3"
                segment={trend}
              />
            )}
            <Scatter data={points} fill="var(--pro)" />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      <p className="mt-1 text-[11px] text-[var(--text-dim)]">{correlationCaption(points)}</p>
    </Card>
  );
}

function PairTooltip({
  active,
  payload,
  xM,
}: {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
  xM: Metric<NutritionKey>;
}) {
  if (!active || !payload?.length) return null;
  const { p, x } = payload[0].payload;
  return (
    <div style={tooltipStyle} className="px-2.5 py-2 leading-relaxed">
      <div className="font-medium">Nutrition — {fmtDate(p.nutritionDate)}</div>
      <div>
        {xM.label}: {Math.round(x)} {xM.unit}
      </div>
      <div className="mt-1 font-medium">WHOOP — {fmtDate(p.whoopDate)}</div>
      <div className="text-[var(--text-dim)]">
        Recovery {show(p.recovery_pct)}% · HRV {show(p.hrv_ms)} ms · RHR {show(p.resting_hr)} bpm
      </div>
    </div>
  );
}
