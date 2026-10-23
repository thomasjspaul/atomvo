import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { useFavourites, useInvalidateAll, useLogFavourite, useLogMeal } from "../lib/queries";
import { Button, Field, Select, Sheet, Spinner, TextInput } from "../components/ui";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { downscaleImage } from "../lib/image";
import type { BarcodeLookup, EstimatedItem, LogMealResponse, Macros } from "../types";

type Tab = "photo" | "text" | "favourite";

const scaleMacros = (m: Macros, f: number): Macros => ({
  calories: Math.round(m.calories * f),
  protein_g: Math.round(m.protein_g * f),
  carbs_g: Math.round(m.carbs_g * f),
  fat_g: Math.round(m.fat_g * f),
});

/** A way to enter the amount scanned. `gramsPerUnit === null` means "use
 *  per_serving directly" (a whole-serving multiplier); otherwise the qty is
 *  converted to grams and scaled against per_100g. */
type PortionUnit = {
  id: string; // stored on the item as its `unit`
  optionLabel: string; // shown in the <select>
  fieldLabel: string; // shown above the number input
  step: string;
  initialQty: string;
  gramsPerUnit: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "1", "1.5", "2/3", "1 1/2" -> number */
function parseAmount(s: string): number | null {
  const t = s.trim();
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return +mixed[1] + +mixed[2] / +mixed[3];
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return +frac[1] / +frac[2];
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Grams in one cup, derived from a serving label like "2/3 cup (55 g)" or
 *  "1 cup (240 ml)". Falls back to serving_g / cup-count. null if not derivable. */
function gramsPerCup(label: string, servingG: number | null): number | null {
  const m = label.match(/([\d./\s]+?)\s*cups?\b/);
  if (!m) return null;
  const cups = parseAmount(m[1]);
  if (!cups || cups <= 0) return null;
  const grams = label.match(/(\d+(?:\.\d+)?)\s*(?:g|ml)\b/);
  if (grams) {
    const g = Number(grams[1]);
    if (Number.isFinite(g) && g > 0) return g / cups;
  }
  if (servingG && servingG > 0) return servingG / cups;
  return null;
}

/** The amount-entry options a scanned product supports. Always at least grams. */
function portionUnits(p: BarcodeLookup): PortionUnit[] {
  const units: PortionUnit[] = [];
  const byServing = p.serving_g != null && p.per_serving != null;
  const servingQty = p.serving_g != null ? String(round2(p.serving_g)) : "100";

  if (byServing) {
    units.push({
      id: "serving",
      optionLabel: p.serving_label ? `serving — ${p.serving_label}` : `serving (${servingQty} g)`,
      fieldLabel: "Servings",
      step: "0.25",
      initialQty: "1",
      gramsPerUnit: null,
    });
  }

  units.push({
    id: "g",
    optionLabel: "grams (g)",
    fieldLabel: "Grams",
    step: "10",
    initialQty: byServing ? servingQty : "100",
    gramsPerUnit: 1,
  });

  const label = (p.serving_label ?? "").toLowerCase();
  const looksVolumetric = /\b(ml|millilit|cup|fl\.?\s*oz|fluid ounce|litre|liter)\b/.test(label);
  if (looksVolumetric) {
    units.push({
      id: "ml",
      optionLabel: "millilitres (ml)",
      fieldLabel: "Millilitres",
      step: "10",
      initialQty: byServing ? servingQty : "100",
      gramsPerUnit: 1, // density ≈ 1 g/ml — the same assumption the API makes
    });
    const gPerCup = gramsPerCup(label, p.serving_g);
    if (gPerCup) {
      units.push({
        id: "cup",
        optionLabel: "cups",
        fieldLabel: "Cups",
        step: "0.25",
        initialQty: "1",
        gramsPerUnit: gPerCup,
      });
    }
  }

  return units;
}

export function LogMealSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("photo");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saveFav, setSaveFav] = useState(false);
  const [when, setWhen] = useState(""); // datetime-local; blank = now
  const [result, setResult] = useState<LogMealResponse | null>(null);
  const [knownItems, setKnownItems] = useState<EstimatedItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [pending, setPending] = useState<BarcodeLookup | null>(null); // scanned, awaiting serving
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const logMeal = useLogMeal();
  const favs = useFavourites();
  const logFav = useLogFavourite();

  function reset() {
    setText("");
    setFile(null);
    setPreview(null);
    setSaveFav(false);
    setWhen("");
    setResult(null);
    setKnownItems([]);
    setScanning(false);
    setPending(null);
    setLookupErr(null);
    setTab("photo");
  }

  async function onScanned(code: string) {
    setScanning(false);
    setLookupErr(null);
    setLookupBusy(true);
    try {
      setPending(await api.get<BarcodeLookup>(`/api/barcode/${code}`));
    } catch (e) {
      setLookupErr(
        e instanceof ApiError && e.status === 404
          ? `No match for ${code} — add it in the description instead.`
          : "Lookup failed — try again or add it in the description.",
      );
    } finally {
      setLookupBusy(false);
    }
  }

  function close() {
    reset();
    onClose();
  }

  const [preparing, setPreparing] = useState(false);

  async function pickFile(f: File | null) {
    if (!f) {
      setFile(null);
      setPreview(null);
      return;
    }
    setPreparing(true);
    const small = await downscaleImage(f).catch(() => f);
    setFile(small);
    setPreview(URL.createObjectURL(small));
    setPreparing(false);
  }

  async function submit() {
    const form = new FormData();
    if (file) form.set("photo", file);
    if (text.trim()) form.set("text", text.trim());
    if (when) form.set("occurred_at", new Date(when).toISOString());
    if (knownItems.length) form.set("known_items", JSON.stringify(knownItems));
    // favourite is created from the *final* numbers in ResultView, not here
    const res = await logMeal.mutateAsync(form);
    setResult(res);
  }

  const canSubmit =
    knownItems.length > 0 || (tab === "photo" ? !!file || !!text.trim() : !!text.trim());

  return (
    <Sheet open={open} onClose={close} title={result ? "Logged" : "Log a meal"}>
      {result ? (
        <ResultView result={result} saveAsFavourite={saveFav} onDone={close} />
      ) : (
        <div className="space-y-4">
          <div className="flex gap-1 rounded-xl bg-[var(--surface-2)] p-1 text-sm">
            {(["photo", "text", "favourite"] as Tab[]).map((t) => (
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

          {tab === "photo" && (
            <div className="space-y-3">
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              {preview ? (
                <div className="relative">
                  <img src={preview} alt="" className="max-h-64 w-full rounded-xl object-cover" />
                  <button
                    onClick={() => pickFile(null)}
                    className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white"
                  >
                    remove
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => cameraRef.current?.click()}
                    className="flex h-32 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--text-dim)]"
                  >
                    <span className="text-2xl">📷</span>
                    Take photo
                  </button>
                  <button
                    onClick={() => galleryRef.current?.click()}
                    className="flex h-32 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--text-dim)]"
                  >
                    <span className="text-2xl">🖼️</span>
                    Choose photo
                  </button>
                </div>
              )}
              {preparing && (
                <p className="text-[11px] text-[var(--text-dim)]">
                  <Spinner /> shrinking photo…
                </p>
              )}
              <Field label="Add a note (optional — helps the estimate)">
                <TextInput
                  placeholder="e.g. large bowl, olive oil, no dressing"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </Field>
            </div>
          )}

          {tab === "text" && (
            <Field label="Describe what you ate">
              <textarea
                autoFocus
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="2 eggs, 60g oats, a banana, black coffee"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--pro)]"
              />
            </Field>
          )}

          {tab === "favourite" && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <Link
                  to="/favourites"
                  onClick={close}
                  className="text-xs text-[var(--text-dim)] underline"
                >
                  Manage favourites →
                </Link>
              </div>
              <Field label="When (leave blank for now)">
                <TextInput
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </Field>
              {favs.data?.favourites.length ? (
                favs.data.favourites.map((f) => (
                  <button
                    key={f.id}
                    disabled={logFav.isPending}
                    onClick={async () => {
                      await logFav.mutateAsync({
                        id: f.id,
                        occurred_at: when ? new Date(when).toISOString() : undefined,
                      });
                      close();
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left active:brightness-95"
                  >
                    <span className="text-sm font-medium">{f.name}</span>
                    <span className="text-xs text-[var(--text-dim)]">
                      {Math.round(f.calories)} kcal · {Math.round(f.protein_g)}g P
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-sm text-[var(--text-dim)]">
                  No favourites yet. Log a meal and tick “save as favourite”.
                </p>
              )}
            </div>
          )}

          {tab !== "favourite" && (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-dim)]">
                    Scanned items {knownItems.length ? `(${knownItems.length})` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setLookupErr(null);
                      setScanning(true);
                    }}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs"
                  >
                    ▮ Scan a barcode
                  </button>
                </div>
                {knownItems.map((it, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {it.name} · {Math.round(it.calories)} kcal ·{" "}
                      <span className="text-[var(--pro)]">{Math.round(it.protein_g)}g P</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setKnownItems(knownItems.filter((_, j) => j !== i))}
                      className="flex-none text-[var(--text-dim)]"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {lookupBusy && (
                  <p className="text-[11px] text-[var(--text-dim)]">
                    <Spinner /> looking up…
                  </p>
                )}
                {lookupErr && <p className="text-[11px] text-[var(--warn)]">{lookupErr}</p>}
                {knownItems.length > 0 && (
                  <p className="text-[11px] text-[var(--text-dim)]">
                    These are added as-is; the description below is estimated on top.
                  </p>
                )}
              </div>

              <Field label="When (leave blank for now)">
                <TextInput
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                <input
                  type="checkbox"
                  checked={saveFav}
                  onChange={(e) => setSaveFav(e.target.checked)}
                />
                Save this as a favourite
              </label>
              {logMeal.isError && (
                <p className="text-xs text-[var(--warn)]">{(logMeal.error as Error).message}</p>
              )}
              <Button
                onClick={submit}
                disabled={!canSubmit || logMeal.isPending || preparing}
                className="w-full"
              >
                {logMeal.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner /> {text.trim() || file ? "Estimating…" : "Logging…"}
                  </span>
                ) : text.trim() || file ? (
                  "Estimate & log"
                ) : (
                  "Log meal"
                )}
              </Button>
            </>
          )}
        </div>
      )}

      {scanning && (
        <BarcodeScanner onDetected={onScanned} onClose={() => setScanning(false)} />
      )}
      {pending && (
        <ServingConfirm
          product={pending}
          onCancel={() => setPending(null)}
          onAdd={(item) => {
            setKnownItems((prev) => [...prev, item]);
            setPending(null);
          }}
        />
      )}
    </Sheet>
  );
}

function ServingConfirm({
  product,
  onAdd,
  onCancel,
}: {
  product: BarcodeLookup;
  onAdd: (item: EstimatedItem) => void;
  onCancel: () => void;
}) {
  const units = useMemo(() => portionUnits(product), [product]);
  const [unitId, setUnitId] = useState(units[0].id);
  const unit = units.find((u) => u.id === unitId) ?? units[0];
  const [qty, setQty] = useState(unit.initialQty);

  const n = Number(qty);
  const valid = Number.isFinite(n) && n > 0;
  const grams = unit.gramsPerUnit != null ? n * unit.gramsPerUnit : null;
  const macros =
    unit.gramsPerUnit == null
      ? scaleMacros(product.per_serving!, valid ? n : 0)
      : scaleMacros(product.per_100g, valid ? (grams as number) / 100 : 0);
  const label = [product.brand, product.name].filter(Boolean).join(" ") || product.code;

  function pickUnit(id: string) {
    const next = units.find((u) => u.id === id);
    if (!next) return;
    setUnitId(id);
    setQty(next.initialQty);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-t-3xl border border-[var(--border)] bg-[var(--surface)] p-4 pb-safe">
        <h2 className="text-base font-semibold">{label}</h2>
        {product.serving_label && (
          <p className="mt-0.5 text-[11px] text-[var(--text-dim)]">
            serving: {product.serving_label}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <div className="w-28 flex-none">
            <Field label={unit.fieldLabel}>
              <TextInput
                type="number"
                inputMode="decimal"
                step={unit.step}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                autoFocus
              />
            </Field>
          </div>
          {units.length > 1 && (
            <div className="min-w-0 flex-1">
              <Field label="Measure">
                <Select value={unitId} onChange={(e) => pickUnit(e.target.value)}>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.optionLabel}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
        </div>
        {grams != null && unit.id !== "g" && valid && (
          <p className="mt-1 text-[11px] text-[var(--text-dim)]">≈ {round2(grams)} g</p>
        )}
        <p className="mt-2 text-sm">
          {macros.calories} kcal ·{" "}
          <span className="text-[var(--pro)]">{macros.protein_g}g P</span> · {macros.carbs_g}g C ·{" "}
          {macros.fat_g}g F
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            className="flex-1"
            disabled={!(macros.calories > 0 || macros.protein_g > 0)}
            onClick={() =>
              onAdd({
                name: label,
                qty: valid ? n : null,
                unit: unit.id,
                ...macros,
              })
            }
          >
            Add to meal
          </Button>
          <Button variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function ResultView({
  result,
  saveAsFavourite,
  onDone,
}: {
  result: LogMealResponse;
  saveAsFavourite: boolean;
  onDone: () => void;
}) {
  const invalidate = useInvalidateAll();
  const e = result.entry;
  const [m, setM] = useState({
    calories: String(Math.round(e.calories)),
    protein_g: String(Math.round(e.protein_g)),
    carbs_g: String(Math.round(e.carbs_g)),
    fat_g: String(Math.round(e.fat_g)),
    creatine_g: e.creatine_g == null ? "" : String(e.creatine_g),
  });

  const macros = () => ({
    calories: Number(m.calories),
    protein_g: Number(m.protein_g),
    carbs_g: Number(m.carbs_g),
    fat_g: Number(m.fat_g),
    creatine_g: m.creatine_g.trim() === "" ? null : Number(m.creatine_g),
  });

  // On finish: persist any macro edits, then (if requested) save the favourite
  // from those *final* numbers — not the AI's original estimate.
  const patch = useMutation({
    mutationFn: async () => {
      if (dirty) await api.patch(`/api/meals/${e.id}`, macros());
      if (saveAsFavourite) {
        await api.post("/api/favourites", {
          name: e.title || "Meal",
          ...macros(),
          source_entry_id: e.id,
        });
      }
    },
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
  });

  const acceptMem = useMutation({
    mutationFn: () => api.post(`/api/memory/${result.memory_suggestion!.id}/accept`),
    onSuccess: () => invalidate(),
  });
  const rejectMem = useMutation({
    mutationFn: () => api.post(`/api/memory/${result.memory_suggestion!.id}/reject`),
    onSuccess: () => invalidate(),
  });

  const dirty =
    Number(m.calories) !== Math.round(e.calories) ||
    Number(m.protein_g) !== Math.round(e.protein_g) ||
    Number(m.carbs_g) !== Math.round(e.carbs_g) ||
    Number(m.fat_g) !== Math.round(e.fat_g) ||
    macros().creatine_g !== e.creatine_g;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-medium">{e.title}</div>
        {e.confidence != null && (
          <div className="text-xs text-[var(--text-dim)]">
            confidence {Math.round(e.confidence * 100)}%
            {e.confidence < 0.5 && " — worth a quick check"}
          </div>
        )}
      </div>

      {e.items.length > 0 && (
        <ul className="space-y-1 text-xs text-[var(--text-dim)]">
          {e.items.map((it, i) => (
            <li key={i}>
              {it.qty ? `${it.qty}${it.unit ? " " + it.unit : ""} ` : ""}
              {it.name} — {Math.round(it.calories)} kcal / {Math.round(it.protein_g)}g P
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-4 gap-2">
        {(["calories", "protein_g", "carbs_g", "fat_g"] as const).map((k) => (
          <label key={k} className="text-center">
            <div className="mb-1 text-[10px] uppercase text-[var(--text-dim)]">
              {k === "calories" ? "kcal" : k[0]}
            </div>
            <input
              type="number"
              inputMode="numeric"
              value={m[k]}
              onChange={(ev) => setM({ ...m, [k]: ev.target.value })}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-1 py-2 text-center text-sm outline-none focus:border-[var(--pro)]"
            />
          </label>
        ))}
      </div>
      <Field label="Creatine (g, optional)">
        <TextInput
          type="number"
          inputMode="decimal"
          step="0.5"
          value={m.creatine_g}
          onChange={(ev) => setM({ ...m, creatine_g: ev.target.value })}
        />
      </Field>
      {e.assumptions && <p className="text-xs text-[var(--text-dim)]">{e.assumptions}</p>}

      {result.coach_message && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
          🍽️ {result.coach_message.text}
        </div>
      )}

      {result.memory_suggestion && !acceptMem.isSuccess && !rejectMem.isSuccess && (
        <div className="rounded-2xl border border-[var(--border)] p-3 text-sm">
          <div className="mb-2 text-[var(--text-dim)]">Remember this?</div>
          <div className="mb-2">“{result.memory_suggestion.text}”</div>
          <div className="flex gap-2">
            <Button onClick={() => acceptMem.mutate()} disabled={acceptMem.isPending}>
              Remember
            </Button>
            <Button variant="subtle" onClick={() => rejectMem.mutate()} disabled={rejectMem.isPending}>
              No thanks
            </Button>
          </div>
        </div>
      )}

      {saveAsFavourite && (
        <p className="text-[11px] text-[var(--text-dim)]">
          Will be saved to favourites with the numbers above.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          onClick={() => (dirty || saveAsFavourite ? patch.mutate() : onDone())}
          disabled={patch.isPending}
          className="flex-1"
        >
          {patch.isPending ? <Spinner /> : dirty || saveAsFavourite ? "Save" : "Done"}
        </Button>
      </div>
    </div>
  );
}
