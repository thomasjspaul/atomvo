import { Card } from "../ui";
import { kgToLb } from "../../lib/format";
import type { InsightsBodyDay } from "../../types";

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/** Latest single-value scale metrics that don't warrant their own trend. */
export function ScaleReadings({
  latest,
  imperial,
}: {
  latest: InsightsBodyDay | null;
  imperial: boolean;
}) {
  if (!latest) return null;
  const show = (v: number | null, digits = 1) => (v == null ? "—" : v.toFixed(digits));
  const bone =
    latest.bone_mass_kg == null
      ? "—"
      : imperial
        ? `${kgToLb(latest.bone_mass_kg).toFixed(1)} lb`
        : `${latest.bone_mass_kg.toFixed(1)} kg`;

  const tiles: [string, string][] = [
    ["BMI", show(latest.bmi)],
    ["Visceral fat", show(latest.visceral_fat, 0)],
    ["Metabolic age", latest.metabolic_age == null ? "—" : String(latest.metabolic_age)],
    ["Body water", latest.body_water_pct == null ? "—" : `${show(latest.body_water_pct)}%`],
    ["Bone mass", bone],
    ["Protein", latest.protein_pct == null ? "—" : `${show(latest.protein_pct)}%`],
  ];

  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Latest scale readings</h2>
        <span className="text-[11px] text-[var(--text-dim)]">as of {fmtDate(latest.date)}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        {tiles.map(([label, val]) => (
          <div key={label}>
            <div className="text-sm font-semibold">{val}</div>
            <div className="text-[11px] text-[var(--text-dim)]">{label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
