import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "../ui";
import type {
  InsightsNutritionDay,
  InsightsWhoopDay,
  InsightsWorkout,
} from "../../types";

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

type Row = {
  date: string;
  label: string;
  carbs_g: number | null;
  day_strain: number | null;
  calories: number | null;
  energy_burned: number | null;
  workouts: InsightsWorkout[];
};

/** Same-day carbohydrate intake (bars) vs WHOOP Day Strain (line). */
export function CarbsVsStrain({
  nutrition,
  whoop,
  workouts,
}: {
  nutrition: InsightsNutritionDay[];
  whoop: InsightsWhoopDay[];
  workouts: InsightsWorkout[];
}) {
  const nByDate = new Map(nutrition.map((x) => [x.date, x]));
  const wByDate = new Map(whoop.map((x) => [x.date, x]));
  const outByDate = new Map<string, InsightsWorkout[]>();
  for (const w of workouts) {
    const arr = outByDate.get(w.date) ?? [];
    arr.push(w);
    outByDate.set(w.date, arr);
  }

  const dates = [...new Set([...nByDate.keys(), ...wByDate.keys()])].sort();
  const rows: Row[] = dates
    .map((date) => {
      const nu = nByDate.get(date);
      const w = wByDate.get(date);
      return {
        date,
        label: fmtDate(date),
        carbs_g: nu?.carbs_g ?? null,
        day_strain: w?.day_strain ?? null,
        calories: nu?.calories ?? null,
        energy_burned: w?.energy_burned ?? null,
        workouts: outByDate.get(date) ?? [],
      };
    })
    .filter((r) => r.carbs_g != null || r.day_strain != null);

  return (
    <Card>
      <h2 className="mb-2 text-sm font-medium">Carbs vs Day Strain</h2>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-[var(--text-dim)]">
          No carbohydrate or strain data in this range yet.
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={rows} margin={{ top: 6, right: 4, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="carbs"
                tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                width={34}
              />
              <YAxis
                yAxisId="strain"
                orientation="right"
                domain={[0, 21]}
                tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                width={26}
              />
              <Tooltip contentStyle={tooltipStyle} content={<StrainTooltip />} />
              <Bar
                yAxisId="carbs"
                dataKey="carbs_g"
                fill="var(--cal)"
                radius={[3, 3, 0, 0]}
                maxBarSize={18}
              />
              <Line
                yAxisId="strain"
                dataKey="day_strain"
                stroke="var(--pro)"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-1 flex gap-4 text-[11px] text-[var(--text-dim)]">
            <span>
              <span style={{ color: "var(--cal)" }}>▮</span> carbs (g)
            </span>
            <span>
              <span style={{ color: "var(--pro)" }}>▬</span> Day Strain
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

function StrainTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div style={tooltipStyle} className="px-2.5 py-2 leading-relaxed">
      <div className="font-medium">{r.label}</div>
      <div>Carbs: {r.carbs_g == null ? "—" : `${Math.round(r.carbs_g)} g`}</div>
      <div>Day Strain: {r.day_strain == null ? "—" : r.day_strain.toFixed(1)}</div>
      <div className="text-[var(--text-dim)]">
        Eaten {r.calories == null ? "—" : `${Math.round(r.calories)} kcal`} · Burned{" "}
        {r.energy_burned == null ? "—" : `${Math.round(r.energy_burned)} kcal`}
      </div>
      {r.workouts.map((w, i) => (
        <div key={i} className="text-[var(--text-dim)]">
          {w.activity}
          {w.strain == null ? "" : ` — Strain ${w.strain.toFixed(1)}`}
        </div>
      ))}
    </div>
  );
}
