import { useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button, Card, Spinner, TextInput } from "../ui";
import { linfit } from "../../lib/insights";
import {
  useAddMeasurement,
  useDeleteMeasurement,
  useMeasurements,
  type InsightRange,
} from "../../lib/queries";

const CM_PER_IN = 2.54;
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
const dayNum = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** Hand-logged waist measurements: add one, see the trend and waist-to-height ratio. */
export function WaistCard({
  range,
  imperial,
  heightCm,
}: {
  range: InsightRange;
  imperial: boolean;
  heightCm: number | null;
}) {
  const q = useMeasurements(range);
  const add = useAddMeasurement();
  const del = useDeleteMeasurement();
  const [input, setInput] = useState("");
  const u = imperial ? "in" : "cm";
  const conv = (cm: number) => +(imperial ? cm / CM_PER_IN : cm).toFixed(1);

  const list = (q.data?.measurements ?? []).filter((m) => m.waist_cm != null);
  const latest = list[list.length - 1];
  const fit =
    list.length >= 3 ? linfit(list.map((m) => ({ x: dayNum(m.date), y: m.waist_cm! }))) : null;
  const span = list.length ? dayNum(list[list.length - 1].date) - dayNum(list[0].date) : 0;
  const change = fit && span >= 14 ? fit.slope * span : null;
  const whtr = latest && heightCm ? latest.waist_cm! / heightCm : null;

  const rows = list.map((m) => ({ date: fmtDate(m.date), waist: conv(m.waist_cm!) }));

  const save = async () => {
    const n = parseFloat(input);
    if (!Number.isFinite(n) || n <= 0) return;
    try {
      await add.mutateAsync({ waist_cm: imperial ? n * CM_PER_IN : n });
      setInput("");
    } catch {
      /* error shown below */
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Waist</h2>
        {change != null && (
          <span className="text-xs text-[var(--text-dim)]">
            {change >= 0 ? "+" : "−"}
            {Math.abs(conv(change)).toFixed(1)} {u} over {Math.round(span)} days
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <TextInput
          type="number"
          inputMode="decimal"
          step="0.1"
          placeholder={`Waist (${u})`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <Button onClick={save} disabled={add.isPending}>
          {add.isPending ? <Spinner /> : "Add"}
        </Button>
      </div>
      {add.isError && (
        <p className="text-[11px] text-[var(--warn)]">Couldn’t save: {(add.error as Error).message}</p>
      )}

      {latest && (
        <p className="text-xs text-[var(--text-dim)]">
          Latest: <span className="font-medium text-[var(--text)]">{conv(latest.waist_cm!)} {u}</span>{" "}
          on {fmtDate(latest.date)}
          {whtr != null && (
            <>
              {" "}
              · waist-to-height{" "}
              <span style={{ color: whtr < 0.5 ? "var(--good)" : "var(--warn)" }}>{whtr.toFixed(2)}</span>
            </>
          )}{" "}
          ·{" "}
          <button
            className="underline"
            disabled={del.isPending}
            onClick={() => confirm("Delete this waist measurement?") && del.mutate(latest.id)}
          >
            delete
          </button>
        </p>
      )}

      {rows.length >= 2 && (
        <ResponsiveContainer width="100%" height={150}>
          <ComposedChart data={rows} margin={{ top: 6, right: 6, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-dim)" }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--text-dim)" }}
              width={34}
              domain={["dataMin - 1", "dataMax + 1"]}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} ${u}`, "waist"]} />
            <Scatter dataKey="waist" fill="var(--text-dim)" />
            <Line dataKey="waist" stroke="var(--warn)" dot={false} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      <details className="text-xs text-[var(--text-dim)]">
        <summary className="cursor-pointer text-[var(--text)]">How to measure consistently</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>
            <b>Same moment each time:</b> once a week, same day, first thing in the morning after
            the bathroom and before eating or drinking — right after your weigh-in.
          </li>
          <li>
            <b>Same spot:</b> horizontally around your belly button. It’s the easiest place to find
            again; whichever spot you pick, never change it.
          </li>
          <li>
            <b>Stand relaxed:</b> feet together, arms at your sides, stomach relaxed — don’t suck
            in. Measure at the end of a normal breath out.
          </li>
          <li>
            <b>Tape on bare skin, level all the way round</b> (check in a mirror), snug but not
            pressing into the skin. A cheap tape with a spring or locking end helps a lot.
          </li>
          <li>
            <b>Measure twice</b> and log the average. If they differ by more than 0.5 cm (¼ in),
            take a third.
          </li>
        </ol>
        <p className="mt-2">
          <b>Reading it:</b> while bulking, weight going up with a flat waist means the gain is
          mostly lean; a waist that climbs steadily means fat is part of it. It’s a check on the
          scale’s fat estimate that isn’t thrown off by hydration the same way. Judge it over a
          month or more — a big meal or salt can add 1–2 cm for a day.
          {heightCm ? " Waist-to-height under 0.50 is the usual healthy target." : ""}
        </p>
      </details>
    </Card>
  );
}
