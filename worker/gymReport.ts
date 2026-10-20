import type { Env } from "./env";
import type { GymReportType } from "../shared/types";
import { kgToLb } from "./nutrition";
import { round1 } from "./util";
import { est1RM } from "./gym";

export interface GymReport {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

interface Opts {
  report: GymReportType;
  from: string;
  to: string;
  imperial: boolean;
}

type SetRow = {
  session_id: string;
  workout_exercise_id: string;
  norm_name: string;
  exercise: string;
  tracking_date: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  is_warmup: boolean;
};

const unit = (imperial: boolean) => (imperial ? "lb" : "kg");
const w = (kg: number | null, imperial: boolean): string | number =>
  kg == null ? "" : imperial ? round1(kgToLb(kg)) : round1(kg);

/** Build the rows for a gym-progress report over an inclusive tracking-date range. */
export async function buildGymReport(env: Env, o: Opts): Promise<GymReport> {
  const [sessRes, setRes] = await Promise.all([
    env.DB.prepare(
      `SELECT s.id, s.tracking_date, s.started_at, s.ended_at, s.title, g.name AS gym_name
         FROM workout_sessions s
         LEFT JOIN gyms g ON g.id = s.gym_id
        WHERE s.status = 'finished' AND s.tracking_date BETWEEN ? AND ?
        ORDER BY s.tracking_date, s.started_at`,
    )
      .bind(o.from, o.to)
      .all<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT st.session_id, st.workout_exercise_id, st.norm_name, st.set_number,
              st.weight_kg, st.reps, st.rpe, st.is_warmup, s.tracking_date,
              COALESCE(ec.canonical_name, we.name, st.norm_name) AS exercise
         FROM workout_sets st
         JOIN workout_sessions s ON s.id = st.session_id AND s.status = 'finished'
         LEFT JOIN workout_exercises we ON we.id = st.workout_exercise_id
         LEFT JOIN exercise_catalog ec ON ec.id = st.catalog_id
        WHERE s.tracking_date BETWEEN ? AND ?
        ORDER BY s.started_at, st.workout_exercise_id, st.set_number`,
    )
      .bind(o.from, o.to)
      .all<Record<string, unknown>>(),
  ]);

  const sets: SetRow[] = setRes.results.map((r) => ({
    session_id: String(r.session_id),
    workout_exercise_id: String(r.workout_exercise_id),
    norm_name: String(r.norm_name),
    exercise: String(r.exercise),
    tracking_date: String(r.tracking_date),
    set_number: Number(r.set_number),
    weight_kg: r.weight_kg == null ? null : Number(r.weight_kg),
    reps: r.reps == null ? null : Number(r.reps),
    rpe: r.rpe == null ? null : Number(r.rpe),
    is_warmup: Number(r.is_warmup) === 1,
  }));

  const U = unit(o.imperial);
  const range = `${o.from} to ${o.to}`;

  if (o.report === "sets") {
    return {
      title: `Gym — every set (${range})`,
      headers: ["Date", "Exercise", "Set", "Type", `Weight (${U})`, "Reps", "RPE", `Est 1RM (${U})`],
      rows: sets.map((s) => [
        s.tracking_date,
        s.exercise,
        s.set_number,
        s.is_warmup ? "warm-up" : "working",
        w(s.weight_kg, o.imperial),
        s.reps ?? "",
        s.rpe ?? "",
        s.is_warmup ? "" : w(est1RM(s.weight_kg, s.reps), o.imperial),
      ]),
    };
  }

  if (o.report === "sessions") {
    const bySession = new Map<string, SetRow[]>();
    for (const s of sets) {
      const a = bySession.get(s.session_id) ?? [];
      a.push(s);
      bySession.set(s.session_id, a);
    }
    return {
      title: `Gym — sessions (${range})`,
      headers: ["Date", "Gym", "Title", "Exercises", "Sets", `Volume (${U})`, "Avg RPE"],
      rows: sessRes.results.map((r) => {
        const ss = bySession.get(String(r.id)) ?? [];
        const working = ss.filter((x) => !x.is_warmup);
        const vol = working.reduce((a, x) => a + (x.weight_kg ?? 0) * (x.reps ?? 0), 0);
        const rpes = working.map((x) => x.rpe).filter((x): x is number => x != null);
        return [
          String(r.tracking_date),
          r.gym_name ? String(r.gym_name) : "",
          r.title ? String(r.title) : "",
          new Set(ss.map((x) => x.workout_exercise_id)).size,
          ss.length,
          w(vol, o.imperial),
          rpes.length ? round1(rpes.reduce((a, b) => a + b, 0) / rpes.length) : "",
        ];
      }),
    };
  }

  // group by exercise for the two summary reports
  const byNorm = new Map<string, { exercise: string; sets: SetRow[] }>();
  for (const s of sets) {
    const g = byNorm.get(s.norm_name) ?? { exercise: s.exercise, sets: [] };
    g.sets.push(s);
    byNorm.set(s.norm_name, g);
  }
  const groups = [...byNorm.values()].sort((a, b) => a.exercise.localeCompare(b.exercise));

  if (o.report === "personal_records") {
    return {
      title: `Gym — personal records (${range})`,
      headers: [
        "Exercise",
        `Best e1RM: weight (${U})`,
        "Reps",
        `Est 1RM (${U})`,
        "Date",
        `Heaviest weight (${U})`,
        "Reps",
        "Date",
      ],
      rows: groups.map((g) => {
        let best1: { e: number; date: string; reps: number | null; kg: number | null } | null = null;
        let bestW: { kg: number; date: string; reps: number | null } | null = null;
        for (const x of g.sets) {
          if (x.is_warmup) continue;
          const e = est1RM(x.weight_kg, x.reps);
          if (e != null && (!best1 || e > best1.e))
            best1 = { e, date: x.tracking_date, reps: x.reps, kg: x.weight_kg };
          if (x.weight_kg != null && (!bestW || x.weight_kg > bestW.kg))
            bestW = { kg: x.weight_kg, date: x.tracking_date, reps: x.reps };
        }
        return [
          g.exercise,
          best1 ? w(best1.kg, o.imperial) : "",
          best1?.reps ?? "",
          best1 ? w(best1.e, o.imperial) : "",
          best1?.date ?? "",
          bestW ? w(bestW.kg, o.imperial) : "",
          bestW?.reps ?? "",
          bestW?.date ?? "",
        ];
      }),
    };
  }

  // exercise_summary (default)
  return {
    title: `Gym — exercise summary (${range})`,
    headers: [
      "Exercise",
      "Sessions",
      `Top weight (${U})`,
      `Top est 1RM (${U})`,
      `Volume (${U})`,
      "Last done",
    ],
    rows: groups.map((g) => {
      const working = g.sets.filter((x) => !x.is_warmup);
      const sessions = new Set(g.sets.map((x) => x.session_id)).size;
      let topW: number | null = null;
      let top1: number | null = null;
      for (const x of working) {
        if (x.weight_kg != null && (topW == null || x.weight_kg > topW)) topW = x.weight_kg;
        const e = est1RM(x.weight_kg, x.reps);
        if (e != null && (top1 == null || e > top1)) top1 = e;
      }
      const vol = working.reduce((a, x) => a + (x.weight_kg ?? 0) * (x.reps ?? 0), 0);
      const last = g.sets.reduce((m, x) => (x.tracking_date > m ? x.tracking_date : m), "");
      return [g.exercise, sessions, w(topW, o.imperial), w(top1, o.imperial), w(vol, o.imperial), last];
    }),
  };
}

/** Self-contained, print-styled HTML report. The client opens it and it prints itself. */
export function renderReportHtml(rep: GymReport, meta: { from: string; to: string }): string {
  const esc = (v: unknown) =>
    String(v ?? "").replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
    );
  const head = rep.headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rep.rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(rep.title)}</title>
<style>
  body{font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;margin:24px;color:#111}
  h1{font-size:17px;margin:0 0 2px}
  .sub{color:#666;margin-bottom:14px;font-size:12px}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #cfcfcf;padding:4px 8px;text-align:left;font-variant-numeric:tabular-nums;white-space:nowrap}
  th{background:#f2f2f2}
  tr:nth-child(even) td{background:#fafafa}
  .hint{margin-top:14px;color:#888;font-size:11px}
  @media print{ body{margin:0} .hint{display:none} @page{margin:14mm} }
</style></head><body>
<h1>${esc(rep.title)}</h1>
<div class="sub">${esc(meta.from)} to ${esc(meta.to)} &middot; generated ${new Date()
    .toISOString()
    .slice(0, 10)} &middot; ${rep.rows.length} row${rep.rows.length === 1 ? "" : "s"}</div>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
<div class="hint">Use your browser's Print dialog and choose “Save as PDF”.</div>
<script>setTimeout(function(){try{window.print()}catch(e){}},350)</script>
</body></html>`;
}
