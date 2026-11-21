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
import { Card } from "../ui";
import { compPoints, rollingBalance } from "../../lib/bodycomp";
import type { InsightsBodyDay } from "../../types";

const WINDOW_DAYS = 60;

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

type Row = { date: string; score: number | null };

/**
 * Lean-vs-fat balance over the trailing 60 days, at every reading. Above 50 = lean winning
 * (most of a gain is lean, most of a loss is fat). Gaps = too little change to judge.
 */
export function LeanBalanceRolling({ body }: { body: InsightsBodyDay[] }) {
  const rows: Row[] = rollingBalance(compPoints(body), WINDOW_DAYS).map((r) => ({
    date: fmtDate(r.iso),
    score: r.score == null ? null : Math.round(r.score),
  }));
  const scored = rows.filter((r) => r.score != null).length;

  return (
    <Card>
      <h2 className="mb-2 text-sm font-medium">Lean vs fat balance ({WINDOW_DAYS}-day rolling)</h2>
      {scored < 2 ? (
        <p className="py-6 text-center text-xs text-[var(--text-dim)]">
          Needs more than {WINDOW_DAYS} days of scale readings in the range. Try 6mo or All.
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={170}>
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
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                unit="%"
              />
              <ReferenceLine y={50} stroke="var(--warn)" strokeDasharray="4 3" />
              <Tooltip contentStyle={tooltipStyle} content={<BalanceTooltip />} />
              <Line dataKey="score" stroke="var(--pro)" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="mt-1 text-[11px] text-[var(--text-dim)]">
            Above the dashed 50% line, lean is winning: most of a gain is lean, or most of a loss
            is fat. 100% = lean up and fat down. Gaps = under 1 lb of change, too small to judge.
          </p>
        </>
      )}
    </Card>
  );
}

function BalanceTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Row }> }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div style={tooltipStyle} className="px-2.5 py-2 leading-relaxed">
      <div className="font-medium">{r.date}</div>
      <div>
        {r.score == null
          ? "Too little change to judge"
          : `${r.score}% — ${r.score >= 50 ? "lean winning" : "fat winning"}`}
      </div>
    </div>
  );
}
