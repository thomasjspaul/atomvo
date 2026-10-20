import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useInsights, useSettings, useStats, type InsightRange } from "../lib/queries";
import { Card, EmptyState } from "../components/ui";
import { Screen } from "../App";
import { kgToLb } from "../lib/format";
import { LaggedScatter } from "../components/insights/LaggedScatter";
import { CarbsVsStrain } from "../components/insights/CarbsVsStrain";
import { GymProgressCard } from "../components/workout/GymProgressCard";
import { MuscleBalanceCard } from "../components/workout/MuscleBalanceCard";
import { BodyComposition } from "../components/insights/BodyComposition";
import { BodyFatMuscle } from "../components/insights/BodyFatMuscle";
import { ScaleReadings } from "../components/insights/ScaleReadings";
import { WHOOP_METRICS, hydrationRecoveryInsight, pairDays } from "../lib/insights";

type Range = 14 | 30 | 90;

const INSIGHT_RANGES: { key: InsightRange; label: string }[] = [
  { key: "30", label: "30d" },
  { key: "90", label: "90d" },
  { key: "180", label: "6mo" },
  { key: "365", label: "1y" },
  { key: "all", label: "All" },
];

export function Progress() {
  const [tab, setTab] = useState<"food" | "gym">("food");
  const [range, setRange] = useState<Range>(30);
  const [wRange, setWRange] = useState<InsightRange>("90");
  const [bRange, setBRange] = useState<InsightRange>("180");
  const stats = useStats(range);
  const insights = useInsights(wRange);
  const bodyInsights = useInsights(bRange);
  const settings = useSettings();
  const imperial = (settings.data?.settings.units ?? "imperial") === "imperial";

  const d = stats.data;
  const ins = insights.data;
  const bIns = bodyInsights.data;
  const shortDate = (s: string) => s.slice(5);

  const laggedPairs = ins ? pairDays(ins.nutrition, ins.whoop_days, 1) : [];
  const waterInsight = hydrationRecoveryInsight(laggedPairs);

  const bfByDate = new Map((bIns?.body ?? []).map((b) => [b.date, b.body_fat_pct]));
  const weightData = (d?.weight_trend ?? []).map((p) => ({
    date: shortDate(p.date),
    raw: p.weight_kg == null ? null : imperial ? +kgToLb(p.weight_kg).toFixed(1) : +p.weight_kg.toFixed(1),
    trend: imperial ? +kgToLb(p.trend_kg).toFixed(1) : +p.trend_kg.toFixed(1),
    bf: bfByDate.get(p.date) ?? null,
  }));
  const hasBf = weightData.some((p) => p.bf != null);
  const rate =
    d?.weight_rate_kg_per_week == null
      ? null
      : imperial
        ? kgToLb(d.weight_rate_kg_per_week)
        : d.weight_rate_kg_per_week;

  const toUnit = (kg: number) => +(imperial ? kgToLb(kg) : kg).toFixed(1);
  const muscleData = (d?.muscle_trend ?? []).map((p) => ({
    date: shortDate(p.date),
    raw: p.weight_kg == null ? null : toUnit(p.weight_kg),
    trend: toUnit(p.trend_kg),
  }));
  const muscleReadings = muscleData.filter((p) => p.raw != null).length;
  const muscleRate =
    d?.muscle_rate_kg_per_week == null
      ? null
      : imperial
        ? kgToLb(d.muscle_rate_kg_per_week)
        : d.muscle_rate_kg_per_week;

  // Ascending by date — oldest left, most recent right.
  const tdeeData = (d?.target_history ?? []).map((t) => ({
    date: shortDate(t.date),
    target: t.calorie_target,
    tdee: t.tdee_estimate,
    basis: t.basis,
  }));

  return (
    <Screen title="Progress">
      <div className="mb-4 flex gap-1 rounded-xl bg-[var(--surface-2)] p-1 text-sm">
        {(["food", "gym"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-1.5 capitalize ${
              tab === t ? "bg-[var(--surface)] font-medium" : "text-[var(--text-dim)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "gym" && (
        <div className="space-y-4">
          <MuscleBalanceCard />
          <GymProgressCard imperial={imperial} />
        </div>
      )}

      {tab === "food" && (
        <>
          <div className="mb-4 flex gap-1 rounded-xl bg-[var(--surface-2)] p-1 text-sm">
            {([14, 30, 90] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`flex-1 rounded-lg py-1.5 ${
                  range === r ? "bg-[var(--surface)] font-medium" : "text-[var(--text-dim)]"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>

          {!d && <EmptyState>Loading…</EmptyState>}

          {d && (
            <div className="space-y-4">
          <Card>
            <h2 className="mb-2 text-sm font-medium">Calories vs target</h2>
            <ResponsiveContainer width="100%" height={170}>
              <ComposedChart data={d.daily.map((x) => ({ ...x, date: shortDate(x.date) }))}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-dim)" }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-dim)" }} width={34} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="calories" fill="var(--cal)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Line
                  type="stepAfter"
                  dataKey="calorie_target"
                  stroke="var(--text)"
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
            <Legend items={[["var(--cal)", "eaten"], ["var(--text)", "target"]]} />
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-medium">Protein vs target</h2>
            <ResponsiveContainer width="100%" height={170}>
              <ComposedChart data={d.daily.map((x) => ({ ...x, date: shortDate(x.date) }))}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-dim)" }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-dim)" }} width={34} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="protein_g" fill="var(--pro)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Line
                  type="stepAfter"
                  dataKey="protein_target_g"
                  stroke="var(--text)"
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
            <Legend items={[["var(--pro)", "eaten"], ["var(--text)", "target"]]} />
          </Card>

          <Card>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Weight trend</h2>
              {rate != null && (
                <span className="text-xs text-[var(--text-dim)]">
                  {rate >= 0 ? "+" : ""}
                  {rate.toFixed(2)} {imperial ? "lb" : "kg"}/wk
                </span>
              )}
            </div>
            {weightData.length < 2 ? (
              <p className="text-xs text-[var(--text-dim)]">Log a few weigh-ins to see a trend.</p>
            ) : (
              <ResponsiveContainer width="100%" height={170}>
                <ComposedChart data={weightData}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-dim)" }} interval="preserveStartEnd" />
                  <YAxis
                    yAxisId="w"
                    tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                    width={38}
                    domain={["dataMin - 1", "dataMax + 1"]}
                  />
                  {hasBf && (
                    <YAxis
                      yAxisId="bf"
                      orientation="right"
                      tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                      width={28}
                      domain={["dataMin - 1", "dataMax + 1"]}
                    />
                  )}
                  <Tooltip contentStyle={tooltipStyle} />
                  <Scatter yAxisId="w" dataKey="raw" fill="var(--text-dim)" />
                  <Line yAxisId="w" dataKey="trend" stroke="var(--pro)" dot={false} strokeWidth={2} />
                  {hasBf && (
                    <Line
                      yAxisId="bf"
                      dataKey="bf"
                      stroke="var(--warn)"
                      dot={false}
                      strokeWidth={1.5}
                      connectNulls
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {hasBf && (
              <div className="mt-1 flex gap-4 text-[11px] text-[var(--text-dim)]">
                <span>
                  <span style={{ color: "var(--pro)" }}>▬</span> weight trend
                </span>
                <span>
                  <span style={{ color: "var(--warn)" }}>▬</span> body fat %
                </span>
              </div>
            )}
          </Card>

          {(d.muscle_trend.length > 0 || bIns?.body_latest) && (
            <Card>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-medium">Muscle mass trend</h2>
                {muscleRate != null && muscleReadings >= 2 && (
                  <span className="text-xs text-[var(--text-dim)]">
                    {muscleRate >= 0 ? "+" : ""}
                    {muscleRate.toFixed(2)} {imperial ? "lb" : "kg"}/wk
                  </span>
                )}
              </div>
              {muscleReadings < 2 ? (
                <p className="text-xs text-[var(--text-dim)]">
                  Needs a few scale readings with muscle mass in this range to show a trend.
                </p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={170}>
                    <ComposedChart data={muscleData}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-dim)" }} interval="preserveStartEnd" />
                      <YAxis
                        tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                        width={38}
                        domain={["dataMin - 1", "dataMax + 1"]}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Scatter name="reading" dataKey="raw" fill="var(--text-dim)" />
                      <Line name="trend" dataKey="trend" stroke="var(--pro)" dot={false} strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <Legend
                    items={[
                      ["var(--text-dim)", "scale reading"],
                      ["var(--pro)", `trend (${imperial ? "lb" : "kg"})`],
                    ]}
                  />
                </>
              )}
            </Card>
          )}

          {bIns?.body_latest && (
            <div className="pt-1">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Body composition</h2>
                <div className="flex gap-1 rounded-lg bg-[var(--surface-2)] p-0.5 text-[11px]">
                  {INSIGHT_RANGES.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setBRange(r.key)}
                      className={`rounded-md px-1.5 py-0.5 ${
                        bRange === r.key
                          ? "bg-[var(--surface)] font-medium"
                          : "text-[var(--text-dim)]"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <BodyComposition body={bIns.body} imperial={imperial} />
                <BodyFatMuscle body={bIns.body} imperial={imperial} />
                <ScaleReadings latest={bIns.body_latest} imperial={imperial} />
              </div>
            </div>
          )}

          <Card>
            <h2 className="mb-2 text-sm font-medium">Target &amp; BMR over time</h2>
            {tdeeData.length < 2 ? (
              <p className="text-xs text-[var(--text-dim)]">
                Shows how your target and BMR shift as your weight / synced BMR change.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart data={tdeeData}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-dim)" }} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                    width={38}
                    domain={["dataMin - 100", "dataMax + 100"]}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="stepAfter" dataKey="tdee" stroke="var(--cal)" dot={false} strokeWidth={2} />
                  <Line
                    type="stepAfter"
                    dataKey="target"
                    stroke="var(--pro)"
                    dot={false}
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            <div className="mt-1 flex gap-4 text-[11px] text-[var(--text-dim)]">
              <span>
                <span className="text-[var(--cal)]">—</span> BMR
              </span>
              <span>
                <span className="text-[var(--pro)]">—</span> calorie target
              </span>
            </div>
          </Card>

          {(d.water_target_ml > 0 || d.daily.some((x) => x.water_ml > 0)) && (
            <Card>
              <h2 className="mb-2 text-sm font-medium">Water</h2>
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart
                  data={d.daily.map((x) => ({
                    ...x,
                    date: shortDate(x.date),
                    water_target_ml: d.water_target_ml || null,
                  }))}
                >
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-dim)" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text-dim)" }} width={42} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="water_ml" fill="var(--cal)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                  {d.water_target_ml > 0 && (
                    <Line
                      dataKey="water_target_ml"
                      stroke="var(--text)"
                      strokeDasharray="4 3"
                      dot={false}
                      strokeWidth={2}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
              <Legend items={[["var(--cal)", "ml drunk"], ["var(--text)", "target"]]} />
              {waterInsight && (
                <p className="mt-1 text-[11px] text-[var(--text-dim)]">{waterInsight}</p>
              )}
            </Card>
          )}

          {d.daily.some((x) => x.bmr_kcal != null) && (
            <Card>
              <h2 className="mb-2 text-sm font-medium">Eaten vs burned</h2>
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart data={d.daily.map((x) => ({ ...x, date: shortDate(x.date) }))}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-dim)" }} interval="preserveStartEnd" />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--text-dim)" }}
                    width={38}
                    domain={["dataMin - 100", "dataMax + 100"]}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="calories" fill="var(--cal)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                  <Line
                    type="stepAfter"
                    dataKey="bmr_kcal"
                    stroke="var(--text-dim)"
                    strokeDasharray="4 3"
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls
                  />
                  <Line
                    dataKey="burned_kcal"
                    stroke="var(--pro)"
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
              <Legend
                items={[
                  ["var(--cal)", "eaten"],
                  ["var(--pro)", "burned"],
                  ["var(--text-dim)", "BMR"],
                ]}
              />
              <p className="mt-1 text-[11px] text-[var(--text-dim)]">
                Burned is your synced expenditure; days with nothing synced fall back to BMR.
              </p>
            </Card>
          )}

          <div className="pt-1">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Nutrition &amp; WHOOP</h2>
              <div className="flex gap-1 rounded-lg bg-[var(--surface-2)] p-0.5 text-[11px]">
                {INSIGHT_RANGES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setWRange(r.key)}
                    className={`rounded-md px-1.5 py-0.5 ${
                      wRange === r.key
                        ? "bg-[var(--surface)] font-medium"
                        : "text-[var(--text-dim)]"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {!ins ? (
              <EmptyState>Loading…</EmptyState>
            ) : ins.whoop_days.length === 0 ? (
              <EmptyState>
                Import your Whoop data in Settings to see nutrition-vs-recovery charts.
              </EmptyState>
            ) : (
              <div className="space-y-4">
                <LaggedScatter
                  paired={laggedPairs}
                  whoopMetrics={WHOOP_METRICS.filter((m) => m.key === "recovery_pct")}
                />
                <LaggedScatter
                  paired={laggedPairs}
                  whoopMetrics={WHOOP_METRICS.filter((m) => m.key !== "recovery_pct")}
                />
                <CarbsVsStrain
                  nutrition={ins.nutrition}
                  whoop={ins.whoop_days}
                  workouts={ins.workouts}
                />
                <p className="text-[11px] text-[var(--text-dim)]">
                  Charts 1–2 pair each day’s nutrition with the <em>next</em> day’s WHOOP; Carbs
                  vs Strain is same-day. Associations only — not cause and effect.
                </p>
              </div>
            )}
          </div>

          <Card className="flex items-center justify-around text-center">
            <div>
              <div className="text-2xl font-semibold">{d.adherence.pct}%</div>
              <div className="text-xs text-[var(--text-dim)]">
                days in range ({d.adherence.days_in_range}/{d.adherence.days_logged})
              </div>
            </div>
            <div className="h-10 w-px bg-[var(--border)]" />
            <div>
              <div className="text-2xl font-semibold">{d.adherence.current_streak}</div>
              <div className="text-xs text-[var(--text-dim)]">day streak</div>
            </div>
          </Card>
          <ReferenceMuted />
        </div>
      )}
        </>
      )}
    </Screen>
  );
}

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
};

function Legend({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="mt-1 flex gap-4 text-[11px] text-[var(--text-dim)]">
      {items.map(([color, label]) => (
        <span key={label}>
          <span style={{ color }}>▬</span> {label}
        </span>
      ))}
    </div>
  );
}

function ReferenceMuted() {
  return (
    <p className="pb-2 text-center text-[11px] text-[var(--text-dim)]">
      “In range” = within 10% of the calorie target and ≥90% of the protein target.
    </p>
  );
}
