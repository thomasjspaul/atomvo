import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useAddWeight, useImportWhoop, useImportWyze, useSettings } from "../lib/queries";
import { Button, Card, Field, Select, Spinner, TextInput } from "../components/ui";
import { Screen } from "../App";
import { cmToFtIn, displayWeight, ftInToCm } from "../lib/format";
import type { Settings as SettingsT } from "../types";

const TIMEZONES = [
  { v: "America/Halifax", label: "Atlantic (Halifax)" },
  { v: "America/St_Johns", label: "Newfoundland (St. John's)" },
  { v: "America/Toronto", label: "Eastern (Toronto)" },
  { v: "America/New_York", label: "Eastern (New York)" },
  { v: "America/Chicago", label: "Central (Chicago)" },
  { v: "America/Denver", label: "Mountain (Denver)" },
  { v: "America/Edmonton", label: "Mountain (Edmonton)" },
  { v: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { v: "America/Vancouver", label: "Pacific (Vancouver)" },
  { v: "America/Anchorage", label: "Alaska (Anchorage)" },
  { v: "Europe/London", label: "UK (London)" },
  { v: "Europe/Paris", label: "Central Europe (Paris)" },
  { v: "Australia/Sydney", label: "Sydney" },
  { v: "UTC", label: "UTC" },
];

export function Settings() {
  const q = useSettings();
  const qc = useQueryClient();
  const addWeight = useAddWeight();
  const [s, setS] = useState<SettingsT | null>(null);
  const [weightInput, setWeightInput] = useState("");

  useEffect(() => {
    if (q.data) setS(q.data.settings);
  }, [q.data]);

  const save = useMutation({
    mutationFn: (body: Partial<SettingsT>) => api.put("/api/settings", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["day"] });
      qc.invalidateQueries({ queryKey: ["target-history"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
  if (!s || !q.data) return <Screen title="Settings">Loading…</Screen>;
  const d = q.data.derived;
  const imperial = s.units === "imperial";
  const set = <K extends keyof SettingsT>(k: K, v: SettingsT[K]) => setS({ ...s, [k]: v });
  const ftin = s.height_cm ? cmToFtIn(s.height_cm) : { ft: 5, in: 10 };

  const round10 = (n: number) => Math.round(n / 10) * 10;
  const round5 = (n: number) => Math.round(n / 5) * 5;

  // BMR the calculated target uses — follows the source picked in Profile, live as it's edited.
  const liveBmr =
    s.bmr_mode === "manual"
      ? s.bmr_kcal || null
      : s.bmr_mode === "synced"
        ? (d.scale_bmr ?? null)
        : (d.mifflin_bmr ?? null);
  const liveAutoCal = liveBmr ? round10(liveBmr + s.surplus_kcal) : null;
  const liveAutoPro =
    s.protein_mode === "fixed"
      ? s.manual_protein_target
      : d.latest_weight_kg
        ? round5(d.latest_weight_kg * s.protein_g_per_kg)
        : null;

  return (
    <Screen title="Settings">
      <div className="space-y-4">
        <Card className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Quick weigh-in</h2>
            <span className="text-xs text-[var(--text-dim)]">
              latest{" "}
              {d.latest_weight_lb
                ? imperial
                  ? `${d.latest_weight_lb} lb`
                  : `${d.latest_weight_kg?.toFixed(1)} kg`
                : "—"}
            </span>
          </div>
          <div className="flex gap-2">
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder={imperial ? "lb" : "kg"}
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
            />
            <Button
              onClick={async () => {
                const n = parseFloat(weightInput);
                if (!Number.isFinite(n) || n <= 0) return;
                try {
                  await addWeight.mutateAsync(imperial ? { weight_lb: n } : { weight_kg: n });
                  setWeightInput("");
                } catch {
                  /* error shown below */
                }
              }}
              disabled={addWeight.isPending}
            >
              {addWeight.isPending ? <Spinner /> : "Add"}
            </Button>
          </div>
          {addWeight.isSuccess && addWeight.data && (
            <p className="text-[11px] text-[var(--good)]">
              Saved {displayWeight(addWeight.data.weight_kg, s.units)}.
            </p>
          )}
          {addWeight.isError && (
            <p className="text-[11px] text-[var(--warn)]">
              Couldn’t save: {(addWeight.error as Error).message}
            </p>
          )}
          {!liveBmr && (
            <p className="text-[11px] text-[var(--warn)]">
              No BMR yet — pick a BMR source under <b>Profile</b> (enter one, or fill in{" "}
              <b>sex, height and birthdate</b> for the formula), then “Recompute target now”.
            </p>
          )}
          <p className="text-[11px] text-[var(--text-dim)]">
            Or auto-sync from Health Connect — see below.
          </p>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">Profile</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sex (for BMR formula)">
              <Select value={s.sex ?? ""} onChange={(e) => set("sex", (e.target.value || null) as SettingsT["sex"])}>
                <option value="">—</option>
                <option value="male">male</option>
                <option value="female">female</option>
              </Select>
            </Field>
            <Field label="Birthdate">
              <TextInput
                type="date"
                value={s.birthdate ?? ""}
                onChange={(e) => set("birthdate", e.target.value || null)}
              />
            </Field>
          </div>
          {imperial ? (
            <Field label="Height">
              <div className="flex gap-2">
                <TextInput
                  type="number"
                  value={String(ftin.ft)}
                  onChange={(e) => set("height_cm", ftInToCm(Number(e.target.value), ftin.in))}
                />
                <span className="self-center text-xs text-[var(--text-dim)]">ft</span>
                <TextInput
                  type="number"
                  value={String(ftin.in)}
                  onChange={(e) => set("height_cm", ftInToCm(ftin.ft, Number(e.target.value)))}
                />
                <span className="self-center text-xs text-[var(--text-dim)]">in</span>
              </div>
            </Field>
          ) : (
            <Field label="Height (cm)">
              <TextInput
                type="number"
                value={s.height_cm ? String(Math.round(s.height_cm)) : ""}
                onChange={(e) => set("height_cm", Number(e.target.value) || null)}
              />
            </Field>
          )}

          <div className="border-t border-[var(--border)] pt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-dim)]">BMR source</span>
              <span className="text-[11px] text-[var(--text-dim)]">
                in use: {liveBmr ? `${Math.round(liveBmr)} kcal` : "—"}
              </span>
            </div>
            <div className="flex gap-1 rounded-xl bg-[var(--surface-2)] p-1 text-sm">
              {(["manual", "calculated", "synced"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => set("bmr_mode", m)}
                  className={`flex-1 rounded-lg py-1.5 capitalize ${
                    s.bmr_mode === m
                      ? "bg-[var(--surface)] font-medium"
                      : "text-[var(--text-dim)]"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {s.bmr_mode === "manual" && (
              <div className="mt-2 flex gap-2">
                <TextInput
                  type="number"
                  inputMode="numeric"
                  placeholder={d.mifflin_bmr ? String(d.mifflin_bmr) : "resting kcal/day"}
                  value={s.bmr_kcal ?? ""}
                  onChange={(e) => set("bmr_kcal", e.target.value ? Number(e.target.value) : null)}
                />
                {d.mifflin_bmr && s.bmr_kcal !== d.mifflin_bmr && (
                  <button
                    type="button"
                    onClick={() => set("bmr_kcal", d.mifflin_bmr)}
                    className="flex-none rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs text-[var(--text-dim)]"
                  >
                    use {d.mifflin_bmr}
                  </button>
                )}
              </div>
            )}
            {s.bmr_mode === "calculated" && (
              <p className="mt-2 text-[11px] text-[var(--text-dim)]">
                {d.mifflin_bmr
                  ? `Mifflin-St Jeor from your profile + latest weigh-in: ${d.mifflin_bmr} kcal. Keep sex, height, birthdate and a recent weight current.`
                  : "Add sex, height, birthdate and log a weight to compute this."}
              </p>
            )}
            {s.bmr_mode === "synced" && (
              <p className="mt-2 text-[11px] text-[var(--text-dim)]">
                {d.scale_bmr
                  ? `From your scale / Health Connect: ${Math.round(d.scale_bmr)} kcal. Refreshes on the next sync.`
                  : "No scale / Health Connect BMR synced yet — see “Auto weight sync” below."}
              </p>
            )}
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">Targets</h2>

          <div className="flex gap-1 rounded-xl bg-[var(--surface-2)] p-1 text-sm">
            {(["auto", "manual"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => set("target_mode", mode)}
                className={`flex-1 rounded-lg py-1.5 capitalize ${
                  s.target_mode === mode
                    ? "bg-[var(--surface)] font-medium"
                    : "text-[var(--text-dim)]"
                }`}
              >
                {mode === "auto" ? "Calculated" : "Manual"}
              </button>
            ))}
          </div>

          {(() => {
            const manual = s.target_mode === "manual";
            const cal = manual ? s.manual_calorie_target : liveAutoCal;
            const pro = manual ? s.manual_protein_target : liveAutoPro;
            return (
              <div className="rounded-xl bg-[var(--surface-2)] p-3">
                {cal ? (
                  <>
                    <div className="text-sm font-semibold">
                      Target: {cal} kcal · {pro ?? "–"} g protein
                    </div>
                    {!manual && liveBmr != null && (
                      <div className="mt-0.5 text-[11px] text-[var(--text-dim)]">
                        {Math.round(liveBmr)} BMR {s.surplus_kcal >= 0 ? "+" : "−"}{" "}
                        {Math.abs(s.surplus_kcal)} kcal
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-[var(--text-dim)]">
                    {manual
                      ? "Enter a calorie and protein target below."
                      : "Add your profile and a weigh-in to see a target."}
                  </div>
                )}
                <div className="mt-1 text-[11px] text-[var(--text-dim)]">
                  Hit “Save settings” to apply.
                </div>
              </div>
            );
          })()}

          {s.target_mode === "manual" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Calorie target">
                <TextInput
                  type="number"
                  inputMode="numeric"
                  value={s.manual_calorie_target ?? ""}
                  onChange={(e) =>
                    set("manual_calorie_target", e.target.value ? Number(e.target.value) : null)
                  }
                />
              </Field>
              <Field label="Protein target (g)">
                <TextInput
                  type="number"
                  inputMode="numeric"
                  value={s.manual_protein_target ?? ""}
                  onChange={(e) =>
                    set("manual_protein_target", e.target.value ? Number(e.target.value) : null)
                  }
                />
              </Field>
            </div>
          )}

          {s.target_mode === "auto" && (
          <>
          {liveBmr == null && (
            <p className="text-[11px] text-[var(--warn)]">
              No BMR yet — pick a BMR source under <b>Profile</b> and give it what it needs.
            </p>
          )}
          <Field
            label={`Calories ${s.surplus_kcal >= 0 ? "above" : "below"} BMR: ${
              s.surplus_kcal >= 0 ? "+" : "−"
            }${Math.abs(s.surplus_kcal)}`}
            hint="Negative = deficit, positive = surplus. Remember BMR is resting only — most people need a few hundred over BMR just to maintain."
          >
            <input
              type="range"
              min={-1000}
              max={1200}
              step={25}
              value={s.surplus_kcal}
              onChange={(e) => set("surplus_kcal", Number(e.target.value))}
              className="w-full"
            />
          </Field>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-dim)]">Protein target</span>
              <div className="flex gap-1 rounded-lg bg-[var(--surface)] p-0.5 text-[11px]">
                {(["per_kg", "fixed"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => set("protein_mode", m)}
                    className={`rounded-md px-2 py-0.5 ${
                      s.protein_mode === m ? "bg-[var(--surface-2)] font-medium" : "text-[var(--text-dim)]"
                    }`}
                  >
                    {m === "per_kg" ? "g/kg" : "grams"}
                  </button>
                ))}
              </div>
            </div>
            {s.protein_mode === "per_kg" ? (
              <Field
                label={`${s.protein_g_per_kg.toFixed(1)} g/kg body weight`}
                hint="1.6–2.2 g/kg is the evidence-based range for gaining/keeping muscle."
              >
                <input
                  type="range"
                  min={1.4}
                  max={2.6}
                  step={0.1}
                  value={s.protein_g_per_kg}
                  onChange={(e) => set("protein_g_per_kg", Number(e.target.value))}
                  className="w-full"
                />
              </Field>
            ) : (
              <Field label="Fixed grams / day" hint="A set number, regardless of weight.">
                <TextInput
                  type="number"
                  inputMode="numeric"
                  value={s.manual_protein_target ?? ""}
                  onChange={(e) =>
                    set("manual_protein_target", e.target.value ? Number(e.target.value) : null)
                  }
                />
              </Field>
            )}
          </div>
          </>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">App</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Units">
              <Select value={s.units} onChange={(e) => set("units", e.target.value as SettingsT["units"])}>
                <option value="imperial">lb / ft-in</option>
                <option value="metric">kg / cm</option>
              </Select>
            </Field>
            <Field label="Day rolls over at">
              <Select
                value={String(s.day_rollover_hour)}
                onChange={(e) => set("day_rollover_hour", Number(e.target.value))}
              >
                {[0, 1, 2, 3, 4, 5, 6].map((h) => (
                  <option key={h} value={h}>
                    {h}:00
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Timezone">
            <Select value={s.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {!TIMEZONES.some((t) => t.v === s.timezone) && (
                <option value={s.timezone}>{s.timezone}</option>
              )}
              {TIMEZONES.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Water target (ml)" hint="0 or blank hides the water tracker on Today.">
            <TextInput
              type="number"
              inputMode="numeric"
              value={s.hydration_target_ml ? String(s.hydration_target_ml) : ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                set("hydration_target_ml", !n || n <= 0 ? 0 : Math.round(n));
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="AI coach">
              <Select
                value={s.coach_style}
                onChange={(e) => set("coach_style", e.target.value as SettingsT["coach_style"])}
              >
                <option value="off">Off</option>
                <option value="brief">Brief</option>
                <option value="balanced">Balanced</option>
                <option value="detailed">Detailed</option>
              </Select>
            </Field>
            <Field label="AI model" hint={q.data.ai_configured ? "API key set" : "no API key — manual entry"}>
              <TextInput value={s.cohere_model} onChange={(e) => set("cohere_model", e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center justify-between text-sm">
            <span>Focus mode (hide calories, show only protein + coach)</span>
            <input
              type="checkbox"
              checked={s.focus_mode}
              onChange={(e) => set("focus_mode", e.target.checked)}
            />
          </label>
        </Card>

        <Card className="space-y-2 text-sm">
          <h2 className="text-sm font-semibold">Auto weight sync (Health Connect)</h2>
          <p className="text-[11px] text-[var(--text-dim)]">
            The Wyze Body Scan syncs to Android Health Connect. Install the{" "}
            <b>Health Connect Webhook</b> app (<code>com.hcwebhook.app</code>), grant it read access
            to Weight, Body Fat, Active/Total Calories &amp; Steps, and point its webhook at:
          </p>
          <Row label="Webhook URL">
            <code className="text-[11px] break-all">
              {window.location.origin}/api/ingest/hc/&lt;ingest-secret&gt;
            </code>
          </Row>
          <Row label="Status">
            {q.data.ingest.configured ? "ingest secret set ✓" : "set INGEST_SHARED_SECRET"}
          </Row>
          <p className="text-[11px] text-[var(--text-dim)]">
            Schedule it for 08:00 &amp; 21:00 (or a 60-min interval). Needs a Cloudflare Access{" "}
            <b>Bypass</b> policy on <code>/api/ingest/*</code>. Calories-burned + steps show on
            Today; set “Expenditure estimate” to <b>Tracked</b> to target off them. Manual weight
            entry above always works too.
          </p>
        </Card>

        <WyzeImportCard />

        <WhoopImportCard />

        <Button
          onClick={() => save.mutate(s)}
          disabled={save.isPending}
          className="w-full shadow-lg shadow-black/30"
        >
          {save.isPending ? <Spinner /> : save.isSuccess ? "Saved ✓" : "Save settings"}
        </Button>
      </div>
    </Screen>
  );
}

function WyzeImportCard() {
  const imp = useImportWyze();
  const [file, setFile] = useState<File | null>(null);
  const r = imp.data;

  return (
    <Card className="space-y-2 text-sm">
      <h2 className="text-sm font-semibold">Import Wyze scale data</h2>
      <p className="text-[11px] text-[var(--text-dim)]">
        Full body-composition history. In the Wyze app: <b>Account → Wyze Scale → data
        export</b>. Upload the <code>.xlsx</code> here, or email it to{" "}
        <code>scale@{window.location.hostname}</code> (accepted only from <code>wyzescale@wyze.com</code>;
        needs a Cloudflare Email Routing rule → Send to Worker). Re-importing is safe; Wyze
        readings supersede the Health-Connect-synced ones.
      </p>
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-xs text-[var(--text-dim)] file:mr-3 file:rounded-lg file:border file:border-[var(--border)] file:bg-[var(--surface-2)] file:px-3 file:py-1.5 file:text-xs file:text-[var(--text)]"
      />
      <Button
        variant="subtle"
        disabled={!file || imp.isPending}
        onClick={() => {
          if (!file) return;
          const fd = new FormData();
          fd.set("file", file);
          imp.mutate(fd);
        }}
      >
        {imp.isPending ? <Spinner /> : "Import"}
      </Button>
      {imp.isError && (
        <p className="text-[11px] text-[var(--warn)]">{(imp.error as Error).message}</p>
      )}
      {r && (
        <p className="text-[11px] text-[var(--text-dim)]">
          {r.new} new · {r.existing} already had · {r.superseded} synced duplicates replaced.
          {r.latest?.weight_kg != null &&
            ` Latest: ${r.latest.weight_kg} kg${
              r.latest.body_fat_pct != null ? `, ${r.latest.body_fat_pct}% BF` : ""
            }.`}
        </p>
      )}
    </Card>
  );
}

function WhoopImportCard() {
  const imp = useImportWhoop();
  const [file, setFile] = useState<File | null>(null);
  const r = imp.data;

  return (
    <Card className="space-y-2 text-sm">
      <h2 className="text-sm font-semibold">Import Whoop data</h2>
      <p className="text-[11px] text-[var(--text-dim)]">
        Upload the <code>.zip</code> from Whoop → Profile → Data Export. Re-uploading is safe —
        only new rows are added, and “Energy burned” becomes each day’s calories-burned figure.
      </p>
      <input
        type="file"
        accept=".zip,application/zip"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-xs text-[var(--text-dim)] file:mr-3 file:rounded-lg file:border file:border-[var(--border)] file:bg-[var(--surface-2)] file:px-3 file:py-1.5 file:text-xs file:text-[var(--text)]"
      />
      <Button
        variant="subtle"
        disabled={!file || imp.isPending}
        onClick={() => {
          if (!file) return;
          const fd = new FormData();
          fd.set("file", file);
          imp.mutate(fd);
        }}
      >
        {imp.isPending ? <Spinner /> : "Import"}
      </Button>
      {imp.isError && (
        <p className="text-[11px] text-[var(--warn)]">{(imp.error as Error).message}</p>
      )}
      {r && (
        <div className="space-y-0.5 text-[11px] text-[var(--text-dim)]">
          <div>
            New: {r.files.cycles.new} cycles · {r.files.sleeps.new} sleeps ·{" "}
            {r.files.workouts.new} workouts · {r.files.journal.new} journal
          </div>
          <div>Calories-burned updated for {r.energy_days} days.</div>
          {r.warnings.map((w, i) => (
            <div key={i} className="text-[var(--warn)]">
              {w}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-dim)]">{label}</span>
      <span>{children}</span>
    </div>
  );
}
