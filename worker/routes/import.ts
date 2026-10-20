import { Hono } from "hono";
import { strFromU8, unzipSync } from "fflate";
import type { AppContext } from "../env";
import type { WhoopImportResult } from "../../shared/types";
import { effectiveTimezone, getSettings, nowIso, rolloverHour } from "../db";
import { WHOOP_FILES, energyByDate, mapRows, matchFiles } from "../whoop";
import { importWyze } from "../wyze";

export const whoopImport = new Hono<AppContext>();

const MAX_BYTES = 25 * 1024 * 1024;
const CHUNK = 50;

const UPSERT_ROW = `INSERT INTO whoop_data (file, natural_key, occurred_at, tracking_date, data, imported_at)
   VALUES (?,?,?,?,?,?)
   ON CONFLICT (file, natural_key) DO UPDATE SET
     occurred_at = excluded.occurred_at,
     tracking_date = excluded.tracking_date,
     data = excluded.data,
     imported_at = excluded.imported_at`;

const UPSERT_ENERGY = `INSERT INTO daily_energy (tracking_date, total_kcal, source, updated_at)
   VALUES (?,?, 'whoop', ?)
   ON CONFLICT (tracking_date) DO UPDATE SET
     total_kcal = excluded.total_kcal,
     source = 'whoop',
     updated_at = excluded.updated_at`;

// POST /api/import/whoop  — multipart, field "file" = the Whoop export .zip.
whoopImport.post("/whoop", async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return c.json({ error: "upload the Whoop export .zip as 'file'" }, 400);
  }
  if (file.size > MAX_BYTES) return c.json({ error: "file too large (max 25 MB)" }, 413);

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return c.json({ error: "could not read the .zip" }, 400);
  }
  const matched = matchFiles(Object.keys(entries));
  if (!WHOOP_FILES.some((f) => matched[f])) {
    return c.json({ error: "no Whoop CSVs (physiological_cycles / sleeps / workouts / journal_entries) found in the zip" }, 400);
  }

  const s = await getSettings(c.env);
  const appTz = effectiveTimezone(c.env, s);
  const roll = rolloverHour(c.env, s);
  const importedAt = nowIso();

  const result: WhoopImportResult = {
    files: {
      cycles: { new: 0, existing: 0 },
      sleeps: { new: 0, existing: 0 },
      workouts: { new: 0, existing: 0 },
      journal: { new: 0, existing: 0 },
    },
    skipped: 0,
    energy_days: 0,
    warnings: [],
  };

  const rowStmt = c.env.DB.prepare(UPSERT_ROW);

  for (const f of WHOOP_FILES) {
    const entry = matched[f];
    if (!entry) {
      result.warnings.push(`${f}: not in the zip`);
      continue;
    }
    const { rows: parsedRows, skipped } = mapRows(f, strFromU8(entries[entry]), appTz, roll);
    result.skipped += skipped;
    // de-dup within the file (Whoop occasionally repeats a key); last one wins
    const byKey = new Map(parsedRows.map((r) => [r.natural_key, r]));
    const rows = [...byKey.values()];

    const known = new Set<string>();
    const kr = await c.env.DB.prepare("SELECT natural_key FROM whoop_data WHERE file = ?")
      .bind(f)
      .all<{ natural_key: string }>();
    for (const k of kr.results) known.add(k.natural_key);
    for (const r of rows) (known.has(r.natural_key) ? result.files[f].existing++ : result.files[f].new++);

    for (let i = 0; i < rows.length; i += CHUNK) {
      await c.env.DB.batch(
        rows
          .slice(i, i + CHUNK)
          .map((r) =>
            rowStmt.bind(r.file, r.natural_key, r.occurred_at, r.tracking_date, r.data, importedAt),
          ),
      );
    }
  }

  // Energy burned -> daily_energy.total_kcal (Whoop wins for the day's burn).
  if (matched.cycles) {
    const { byDate, warning } = energyByDate(strFromU8(entries[matched.cycles]), appTz, roll);
    if (warning) result.warnings.push(warning);
    const energyStmt = c.env.DB.prepare(UPSERT_ENERGY);
    const days = [...byDate.entries()];
    for (let i = 0; i < days.length; i += CHUNK) {
      await c.env.DB.batch(
        days
          .slice(i, i + CHUNK)
          .map(([d, kcal]) => energyStmt.bind(d, Math.round(kcal), importedAt)),
      );
    }
    result.energy_days = days.length;
  }

  return c.json(result);
});

// POST /api/import/wyze  — multipart, field "file" = the Wyze scale .xlsx export.
whoopImport.post("/wyze", async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return c.json({ error: "upload the Wyze export .xlsx as 'file'" }, 400);
  }
  if (file.size > MAX_BYTES) return c.json({ error: "file too large (max 25 MB)" }, 413);
  try {
    return c.json(await importWyze(c.env, new Uint8Array(await file.arrayBuffer())));
  } catch (e) {
    return c.json({ error: (e as Error).message || "import failed" }, 400);
  }
});
