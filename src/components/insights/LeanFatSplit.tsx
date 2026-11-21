import { Card } from "../ui";
import { kgToLb } from "../../lib/format";
import { MIN_READINGS, MIN_SPAN_DAYS, STEADY_KG, compChange, compPoints } from "../../lib/bodycomp";
import type { InsightsBodyDay } from "../../types";

type Verdict = { tone: "good" | "bad" | "neutral"; headline: string; detail: string };

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/**
 * Where the weight change is going: lean vs fat, from the trend line across every
 * reading in the range (least-squares fit), so single-day scale swings don't count.
 * `period` narrows it to a span picked on the Body composition chart.
 */
export function LeanFatSplit({
  body,
  imperial,
  period,
}: {
  body: InsightsBodyDay[];
  imperial: boolean;
  period: { from: string; to: string } | null;
}) {
  const u = imperial ? "lb" : "kg";
  const conv = (kg: number) => (imperial ? kgToLb(kg) : kg);

  const pts = compPoints(body).filter(
    (p) => !period || (p.iso >= period.from && p.iso <= period.to),
  );
  const change = compChange(pts);
  const when =
    pts.length === 0
      ? ""
      : period
        ? `${fmtDate(pts[0].iso)} – ${fmtDate(pts[pts.length - 1].iso)}`
        : `last ${Math.round(pts[pts.length - 1].day - pts[0].day)} days`;

  if (!change) {
    return (
      <Card>
        <h2 className="mb-1 text-sm font-medium">Lean vs fat change</h2>
        <p className="py-3 text-center text-xs text-[var(--text-dim)]">
          Needs at least {MIN_READINGS} scale readings over {MIN_SPAN_DAYS}+ days
          {period ? " in the selected period" : " in this range"}.
        </p>
      </Card>
    );
  }

  const { dLean, dFat, span } = change;
  const v = verdict(dLean, dFat);
  const weeks = span / 7;
  const fmt = (kg: number, dp = 1) => `${kg >= 0 ? "+" : "−"}${Math.abs(conv(kg)).toFixed(dp)}`;
  const toneColor =
    v.tone === "good" ? "var(--pro)" : v.tone === "bad" ? "var(--warn)" : "var(--text-dim)";

  // Split bar: each side's share of the total movement.
  const total = Math.abs(dLean) + Math.abs(dFat);
  const leanW = total > 0 ? (Math.abs(dLean) / total) * 100 : 50;

  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Lean vs fat change</h2>
        <span className="text-[11px] text-[var(--text-dim)]">{when}</span>
      </div>

      <div className="text-lg font-semibold" style={{ color: toneColor }}>
        {v.headline}
      </div>
      <p className="mb-3 text-xs text-[var(--text-dim)]">{v.detail}</p>

      <div className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div style={{ width: `${leanW}%`, background: "var(--pro)", opacity: dLean < 0 ? 0.4 : 1 }} />
        <div style={{ width: `${100 - leanW}%`, background: "var(--warn)", opacity: dFat < 0 ? 0.4 : 1 }} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="lean" color="var(--pro)" value={`${fmt(dLean)} ${u}`} rate={`${fmt(dLean / weeks, 2)}/wk`} />
        <Stat label="fat" color="var(--warn)" value={`${fmt(dFat)} ${u}`} rate={`${fmt(dFat / weeks, 2)}/wk`} />
        <Stat
          label="total"
          color="var(--text)"
          value={`${fmt(dLean + dFat)} ${u}`}
          rate={`${fmt((dLean + dFat) / weeks, 2)}/wk`}
        />
      </div>

      <p className="mt-2 text-[11px] text-[var(--text-dim)]">
        From the trend across all readings, not day-to-day swings. Lean mass is everything that
        isn’t fat (muscle, water, bone, organs), so water shifts move it too.
      </p>
    </Card>
  );
}

function verdict(dLean: number, dFat: number): Verdict {
  if (Math.abs(dLean) + Math.abs(dFat) < STEADY_KG) {
    return { tone: "neutral", headline: "Holding steady", detail: "No meaningful change in lean or fat yet." };
  }
  if (dLean >= 0 && dFat <= 0) {
    return { tone: "good", headline: "Recomp: lean up, fat down", detail: "Best case — gaining lean while losing fat." };
  }
  if (dLean <= 0 && dFat >= 0) {
    return { tone: "bad", headline: "Fat up, lean down", detail: "All of the change is going the wrong way." };
  }
  if (dLean > 0 && dFat > 0) {
    const pct = Math.round((dLean / (dLean + dFat)) * 100);
    return pct >= 50
      ? { tone: "good", headline: `${pct}% of gain is lean`, detail: `Lean is outpacing fat — ${ratio(dLean, dFat)} lean per 1 fat.` }
      : { tone: "bad", headline: `${100 - pct}% of gain is fat`, detail: `Fat is outpacing lean — ${ratio(dFat, dLean)} fat per 1 lean.` };
  }
  // Both down: losing weight. Good when most of the loss is fat.
  const pct = Math.round((dFat / (dLean + dFat)) * 100);
  return pct >= 50
    ? { tone: "good", headline: `${pct}% of loss is fat`, detail: "Losing mostly fat, keeping most of your lean." }
    : { tone: "bad", headline: `${100 - pct}% of loss is lean`, detail: "Losing more lean than fat." };
}

const ratio = (a: number, b: number) => (a / b).toFixed(1);

function Stat({ label, color, value, rate }: { label: string; color: string; value: string; rate: string }) {
  return (
    <div>
      <div className="text-sm font-semibold" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] text-[var(--text-dim)]">
        {label} · {rate}
      </div>
    </div>
  );
}
