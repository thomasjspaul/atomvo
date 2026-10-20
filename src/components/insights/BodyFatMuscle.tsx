import {
  CartesianGrid,
  ComposedChart,
  Line,
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

type Row = { date: string; bf: number | null; muscle: number | null };

/** Body fat % (left) and muscle mass (right) over time. */
export function BodyFatMuscle({
  body,
  imperial,
}: {
  body: InsightsBodyDay[];
  imperial: boolean;
}) {
  const u = imperial ? "lb" : "kg";
  const rows: Row[] = body
    .map((b) => ({
      date: fmtDate(b.date),
      bf: b.body_fat_pct,
      muscle:
        b.muscle_mass_kg == null
          ? null
          : +(imperial ? kgToLb(b.muscle_mass_kg) : b.muscle_mass_kg).toFixed(1),
    }))
    .filter((r) => r.bf != null || r.muscle != null);

  return (
    <Card>
      <h2 className="mb-2 text-sm font-medium">Body fat % &amp; muscle mass</h2>
      {rows.length < 2 ? (
        <p className="py-6 text-center text-xs text-[var(--text-dim)]">
          Needs a few scale readings to show a trend.
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={rows} margin={{ top: 6, right: 4, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="bf"
                tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                width={30}
                domain={["dataMin - 1", "dataMax + 1"]}
              />
              <YAxis
                yAxisId="muscle"
                orientation="right"
                tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                width={30}
                domain={["dataMin - 2", "dataMax + 2"]}
              />
              <Tooltip contentStyle={tooltipStyle} content={<BfmTooltip u={u} />} />
              <Line
                yAxisId="bf"
                dataKey="bf"
                stroke="var(--warn)"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
              <Line
                yAxisId="muscle"
                dataKey="muscle"
                stroke="var(--pro)"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-1 flex gap-4 text-[11px] text-[var(--text-dim)]">
            <span>
              <span style={{ color: "var(--warn)" }}>▬</span> body fat %
            </span>
            <span>
              <span style={{ color: "var(--pro)" }}>▬</span> muscle mass ({u})
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

function BfmTooltip({
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
  return (
    <div style={tooltipStyle} className="px-2.5 py-2 leading-relaxed">
      <div className="font-medium">{r.date}</div>
      <div>Body fat: {r.bf == null ? "—" : `${r.bf}%`}</div>
      <div>Muscle mass: {r.muscle == null ? "—" : `${r.muscle} ${u}`}</div>
    </div>
  );
}
