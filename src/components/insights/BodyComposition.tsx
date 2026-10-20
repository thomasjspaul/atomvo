import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "../ui";
import { kgToLb } from "../../lib/format";
import type { InsightsBodyDay } from "../../types";

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

type Row = { date: string; lean: number | null; fat: number | null; bf: number | null; weight: number | null };

/** Stacked lean vs fat mass over time — recomp view. */
export function BodyComposition({
  body,
  imperial,
}: {
  body: InsightsBodyDay[];
  imperial: boolean;
}) {
  const u = imperial ? "lb" : "kg";
  const conv = (v: number | null) => (v == null ? null : +(imperial ? kgToLb(v) : v).toFixed(1));

  const rows: Row[] = body
    .map((b) => ({
      date: fmtDate(b.date),
      lean: conv(b.lean_mass_kg),
      fat: conv(b.fat_mass_kg),
      bf: b.body_fat_pct,
      weight: conv(b.weight_kg),
    }))
    .filter((r) => r.lean != null || r.fat != null);

  return (
    <Card>
      <h2 className="mb-2 text-sm font-medium">Body composition</h2>
      {rows.length < 2 ? (
        <p className="py-6 text-center text-xs text-[var(--text-dim)]">
          Needs a few scale readings to show a trend.
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={rows} margin={{ top: 6, right: 6, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                width={34}
                domain={["dataMin - 3", "dataMax + 3"]}
              />
              <Tooltip contentStyle={tooltipStyle} content={<CompTooltip u={u} />} />
              <Area
                dataKey="lean"
                stackId="m"
                stroke="var(--pro)"
                fill="var(--pro)"
                fillOpacity={0.35}
                connectNulls
              />
              <Area
                dataKey="fat"
                stackId="m"
                stroke="var(--warn)"
                fill="var(--warn)"
                fillOpacity={0.35}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-1 flex gap-4 text-[11px] text-[var(--text-dim)]">
            <span>
              <span style={{ color: "var(--pro)" }}>▮</span> lean mass
            </span>
            <span>
              <span style={{ color: "var(--warn)" }}>▮</span> fat mass
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

function CompTooltip({
  active,
  payload,
  u,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  u: string;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const g = (v: number | null, s: string) => (v == null ? "—" : `${v} ${s}`);
  return (
    <div style={tooltipStyle} className="px-2.5 py-2 leading-relaxed">
      <div className="font-medium">{r.date}</div>
      <div>Weight: {g(r.weight, u)}</div>
      <div>
        Lean: <span style={{ color: "var(--pro)" }}>{g(r.lean, u)}</span>
      </div>
      <div>
        Fat: <span style={{ color: "var(--warn)" }}>{g(r.fat, u)}</span>
        {r.bf == null ? "" : ` (${r.bf}%)`}
      </div>
    </div>
  );
}
