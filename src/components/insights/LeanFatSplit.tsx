import { Card } from "../ui";
import { kgToLb } from "../../lib/format";
import { linfit } from "../../lib/insights";
import type { InsightsBodyDay } from "../../types";

const MIN_READINGS = 4;
const MIN_SPAN_DAYS = 14;
/** Below this total change (kg) the split is noise, not signal. */
const STEADY_KG = 0.5;

type Verdict = { tone: "good" | "bad" | "neutral"; headline: string; detail: string };

/**
 * Where the weight change is going: lean vs fat, from the trend line across every
 * reading in the range (least-squares fit), so single-day scale swings don't count.
 */
export function LeanFatSplit({ body, imperial }: { body: InsightsBodyDay[]; imperial: boolean }) {
  const u = imperial ? "lb" : "kg";
  const conv = (kg: number) => (imperial ? kgToLb(kg) : kg);

  const pts = body
    .map((b) => {
      const fat =
        b.fat_mass_kg ??
        (b.weight_kg != null && b.body_fat_pct != null ? (b.weight_kg * b.body_fat_pct) / 100 : null);
      const lean = b.lean_mass_kg ?? (b.weight_kg != null && fat != null ? b.weight_kg - fat : null);
      const day = Date.parse(`${b.date}T00:00:00Z`) / 86_400_000;
      return lean == null || fat == null ? null : { day, lean, fat };
    })
    .filter((p): p is { day: number; lean: number; fat: number } => p != null);

  const span = pts.length ? pts[pts.length - 1].day - pts[0].day : 0;
  const leanFit = linfit(pts.map((p) => ({ x: p.day, y: p.lean })));
  const fatFit = linfit(pts.map((p) => ({ x: p.day, y: p.fat })));

  if (pts.length < MIN_READINGS || span < MIN_SPAN_DAYS || !leanFit || !fatFit) {
    return (
      <Card>
        <h2 className="mb-1 text-sm font-medium">Lean vs fat change</h2>
        <p className="py-3 text-center text-xs text-[var(--text-dim)]">
          Needs at least {MIN_READINGS} scale readings over {MIN_SPAN_DAYS}+ days in this range.
        </p>
      </Card>
    );
  }

  const dLean = leanFit.slope * span;
  const dFat = fatFit.slope * span;
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
        <span className="text-[11px] text-[var(--text-dim)]">last {Math.round(span)} days</span>
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
