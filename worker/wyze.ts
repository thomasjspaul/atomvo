import type { Env } from "./env";
import type { WyzeImportResult } from "../shared/types";
import { effectiveTimezone, genId, getSettings, nowIso, rolloverHour } from "./db";
import { lbToKg } from "./nutrition";
import { localParts, trackingDate } from "./time";
import { readSheetRows } from "./xlsx";

export interface WyzeMeasurement {
  measured_at: string; // ISO UTC
  tracking_date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  bmi: number | null;
  muscle_mass_kg: number | null;
  muscle_mass_pct: number | null;
  body_water_pct: number | null;
  lean_mass_kg: number | null;
  fat_mass_kg: number | null;
  bone_mass_kg: number | null;
  protein_pct: number | null;
  visceral_fat: number | null;
  bmr_kcal: number | null;
  metabolic_age: number | null;
  skeletal_muscle_pct: number | null;
  subcutaneous_fat_pct: number | null;
  raw: Record<string, string>;
}

const MINUTE_MS = 60_000; // the export only has minute precision

/** Wall-clock local time (no offset in the export) -> UTC instant, DST-safe. */
function wallClockToUtcIso(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  tz: string,
): string {
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess), tz);
    const local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    if (local === target) break;
    guess += target - local;
  }
  return new Date(Math.round(guess / MINUTE_MS) * MINUTE_MS).toISOString();
}

function parseWhen(s: string): [number, number, number, number, number] | null {
  const m = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(
    s.trim(),
  );
  if (!m) return null;
  let h = Number(m[4]);
  const ap = m[6]?.toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return [Number(m[1]), Number(m[2]), Number(m[3]), h, Number(m[5])];
}

const pnum = (v: string | undefined): number | null => {
  if (v == null) return null;
  const cleaned = v.replace(/(kg|lb|%|,)/gi, "").trim();
  if (cleaned === "") return null;
  const x = parseFloat(cleaned);
  return Number.isFinite(x) ? x : null;
};

export function parseWyzeRows(
  bytes: Uint8Array,
  appTz: string,
  roll: number,
): { rows: WyzeMeasurement[]; error?: string } {
  let grid: string[][];
  try {
    grid = readSheetRows(bytes);
  } catch {
    return { rows: [], error: "could not read the spreadsheet" };
  }
  const headerIdx = grid.findIndex((r) => r.some((c) => /date and time/i.test(c)));
  if (headerIdx < 0) return { rows: [], error: "no 'Date and Time' column found" };

  const header = grid[headerIdx];
  const col = (name: RegExp) => header.findIndex((h) => name.test(h.trim()));
  const ix = {
    when: col(/^date and time$/i),
    weight: col(/^weight\s*\(kg\)$/i),
    bf: col(/^body fat$/i),
    bmi: col(/^bmi$/i),
    muscle: col(/^muscle mass$/i),
    musclePct: col(/^muscle mass\s*%$/i),
    water: col(/^body water$/i),
    lean: col(/^lean body mass$/i),
    fat: col(/^fat content$/i),
    bone: col(/^bone mass$/i),
    protein: col(/^protein$/i),
    visceral: col(/^visceral fat$/i),
    bmr: col(/^bmr$/i),
    metAge: col(/^metabolic age$/i),
    skeletal: col(/skeletal muscle/i),
    subq: col(/^subcutaneous fat$/i),
  };

  const rows: WyzeMeasurement[] = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const cells = grid[r];
    const when = parseWhen(cells[ix.when] ?? "");
    if (!when) continue;
    const measured_at = wallClockToUtcIso(when[0], when[1], when[2], when[3], when[4], appTz);
    const g = (i: number) => (i >= 0 ? pnum(cells[i]) : null);
    const lb = (i: number) => {
      const n = g(i);
      return n == null ? null : Number(lbToKg(n).toFixed(2));
    };
    const raw: Record<string, string> = {};
    header.forEach((h, i) => {
      if (h.trim()) raw[h.trim()] = cells[i] ?? "";
    });

    rows.push({
      measured_at,
      tracking_date: trackingDate(new Date(measured_at), appTz, roll),
      weight_kg: g(ix.weight),
      body_fat_pct: g(ix.bf),
      bmi: g(ix.bmi),
      muscle_mass_kg: lb(ix.muscle),
      muscle_mass_pct: g(ix.musclePct),
      body_water_pct: g(ix.water),
      lean_mass_kg: lb(ix.lean),
      fat_mass_kg: lb(ix.fat),
      bone_mass_kg: lb(ix.bone),
      protein_pct: g(ix.protein),
      visceral_fat: g(ix.visceral),
      bmr_kcal: g(ix.bmr),
      metabolic_age: g(ix.metAge),
      skeletal_muscle_pct: g(ix.skeletal),
      subcutaneous_fat_pct: g(ix.subq),
      raw,
    });
  }
  return { rows };
}

const VALUE_COLS = [
  "weight_kg",
  "body_fat_pct",
  "bmr_kcal",
  "muscle_mass_kg",
  "bmi",
  "muscle_mass_pct",
  "lean_mass_kg",
  "fat_mass_kg",
  "bone_mass_kg",
  "body_water_pct",
  "protein_pct",
  "visceral_fat",
  "metabolic_age",
  "skeletal_muscle_pct",
  "subcutaneous_fat_pct",
] as const;

const UPSERT = `INSERT INTO weights
   (id, measured_at, tracking_date, ${VALUE_COLS.join(", ")}, source, raw_json, created_at)
   VALUES (${Array(VALUE_COLS.length + 6).fill("?").join(",")})
   ON CONFLICT (measured_at, source) DO UPDATE SET
     tracking_date = excluded.tracking_date,
     raw_json = excluded.raw_json,
     ${VALUE_COLS.map((c) => `${c} = COALESCE(excluded.${c}, weights.${c})`).join(",\n     ")}`;

export async function importWyze(env: Env, bytes: Uint8Array): Promise<WyzeImportResult> {
  const s = await getSettings(env);
  const appTz = effectiveTimezone(env, s);
  const roll = rolloverHour(env, s);

  const { rows, error } = parseWyzeRows(bytes, appTz, roll);
  if (error) throw new Error(error);
  if (!rows.length) throw new Error("no readings found in the spreadsheet");

  // de-dup within the file by measured_at (latest kept), then classify new/existing
  const byKey = new Map(rows.map((r) => [r.measured_at, r]));
  const uniq = [...byKey.values()];
  const known = new Set<string>();
  const kr = await env.DB.prepare(
    "SELECT measured_at FROM weights WHERE source = 'wyze_scale'",
  ).all<{ measured_at: string }>();
  for (const k of kr.results) known.add(k.measured_at);
  let created = 0;
  for (const r of uniq) if (!known.has(r.measured_at)) created++;

  const now = nowIso();
  const stmt = env.DB.prepare(UPSERT);
  for (let i = 0; i < uniq.length; i += 50) {
    await env.DB.batch(
      uniq.slice(i, i + 50).map((r) =>
        stmt.bind(
          genId(),
          r.measured_at,
          r.tracking_date,
          ...VALUE_COLS.map((c) => r[c]),
          "wyze_scale",
          JSON.stringify(r.raw),
          now,
        ),
      ),
    );
  }

  // Wyze is authoritative — drop HC/HA weigh-ins within 5 min of a Wyze reading.
  const sup = await env.DB.prepare(
    `DELETE FROM weights WHERE source IN ('health_connect','wyze_ha') AND EXISTS (
       SELECT 1 FROM weights w2 WHERE w2.source = 'wyze_scale'
         AND ABS(strftime('%s', weights.measured_at) - strftime('%s', w2.measured_at)) <= 300)`,
  ).run();

  // Point the synced BMR at the newest Wyze reading.
  const latestBmr = await env.DB.prepare(
    "SELECT bmr_kcal FROM weights WHERE source = 'wyze_scale' AND bmr_kcal IS NOT NULL ORDER BY measured_at DESC LIMIT 1",
  ).first<{ bmr_kcal: number }>();
  if (latestBmr && latestBmr.bmr_kcal >= 600 && latestBmr.bmr_kcal <= 5000) {
    await env.DB.prepare("UPDATE settings SET bmr_kcal = ? WHERE id = 1")
      .bind(Math.round(latestBmr.bmr_kcal))
      .run();
  }

  const latest = uniq.reduce<WyzeMeasurement | null>(
    (a, b) => (!a || b.measured_at > a.measured_at ? b : a),
    null,
  );

  return {
    new: created,
    existing: uniq.length - created,
    superseded: sup.meta.changes ?? 0,
    latest: latest
      ? {
          measured_at: latest.measured_at,
          weight_kg: latest.weight_kg,
          body_fat_pct: latest.body_fat_pct,
        }
      : null,
  };
}
