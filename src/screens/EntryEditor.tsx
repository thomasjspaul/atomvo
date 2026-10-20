import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { useInvalidateAll } from "../lib/queries";
import { Button, Field, Sheet, Spinner, TextInput } from "../components/ui";
import type { Entry, EstimatedItem } from "../types";

interface ItemRow extends EstimatedItem {
  qtyStr: string; // editable
}

// macros the AI gave are for `item.qty` of `item.unit`; scale linearly.
function baseQty(it: EstimatedItem): number {
  return it.qty && it.qty > 0 ? it.qty : 1;
}
function scaledItem(row: ItemRow): EstimatedItem {
  const factor = (parseFloat(row.qtyStr) || 0) / baseQty(row);
  return {
    name: row.name,
    qty: parseFloat(row.qtyStr) || null,
    unit: row.unit,
    calories: row.calories * factor,
    protein_g: row.protein_g * factor,
    carbs_g: row.carbs_g * factor,
    fat_g: row.fat_g * factor,
  };
}
function sum(items: EstimatedItem[]) {
  return items.reduce(
    (a, it) => ({
      calories: a.calories + it.calories,
      protein_g: a.protein_g + it.protein_g,
      carbs_g: a.carbs_g + it.carbs_g,
      fat_g: a.fat_g + it.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

export function EntryEditor({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const [form, setForm] = useState({ title: "", user_text: "", occurred_at: "" });
  const [items, setItems] = useState<ItemRow[]>([]);
  const [macros, setMacros] = useState({
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
    creatine_g: "",
  });

  useEffect(() => {
    if (!entry) return;
    setForm({
      title: entry.title ?? "",
      user_text: entry.user_text ?? "",
      occurred_at: toLocalInput(entry.occurred_at),
    });
    setItems(entry.items.map((it) => ({ ...it, qtyStr: String(it.qty ?? 1) })));
    setMacros({
      calories: String(Math.round(entry.calories)),
      protein_g: String(Math.round(entry.protein_g)),
      carbs_g: String(Math.round(entry.carbs_g)),
      fat_g: String(Math.round(entry.fat_g)),
      creatine_g: entry.creatine_g == null ? "" : String(entry.creatine_g),
    });
  }, [entry]);

  const scaled = useMemo(() => items.map(scaledItem), [items]);

  function setQty(i: number, v: string) {
    const next = items.map((it, idx) => (idx === i ? { ...it, qtyStr: v } : it));
    setItems(next);
    const t = sum(next.map(scaledItem));
    setMacros((m) => ({
      ...m,
      calories: String(Math.round(t.calories)),
      protein_g: String(Math.round(t.protein_g)),
      carbs_g: String(Math.round(t.carbs_g)),
      fat_g: String(Math.round(t.fat_g)),
    }));
  }

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/api/meals/${entry!.id}`, {
        title: form.title,
        user_text: form.user_text,
        occurred_at: new Date(form.occurred_at).toISOString(),
        calories: Number(macros.calories),
        protein_g: Number(macros.protein_g),
        carbs_g: Number(macros.carbs_g),
        fat_g: Number(macros.fat_g),
        creatine_g: macros.creatine_g.trim() === "" ? null : Number(macros.creatine_g),
        items: scaled,
      }),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  const reestimate = useMutation({
    mutationFn: () => api.post<Entry>(`/api/meals/${entry!.id}/reestimate`),
    onSuccess: (e) => {
      setForm((f) => ({ ...f, title: e.title ?? "" }));
      setItems(e.items.map((it) => ({ ...it, qtyStr: String(it.qty ?? 1) })));
      setMacros((m) => ({
        ...m,
        calories: String(Math.round(e.calories)),
        protein_g: String(Math.round(e.protein_g)),
        carbs_g: String(Math.round(e.carbs_g)),
        fat_g: String(Math.round(e.fat_g)),
      }));
      invalidate();
    },
  });

  const del = useMutation({
    mutationFn: () => api.del(`/api/meals/${entry!.id}`),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  const saveFav = useMutation({
    mutationFn: () =>
      api.post("/api/favourites", {
        name: form.title || "Meal",
        calories: Number(macros.calories),
        protein_g: Number(macros.protein_g),
        carbs_g: Number(macros.carbs_g),
        fat_g: Number(macros.fat_g),
        creatine_g: macros.creatine_g.trim() === "" ? null : Number(macros.creatine_g),
        source_entry_id: entry!.id,
      }),
  });

  return (
    <Sheet open={!!entry} onClose={onClose} title="Edit entry">
      {entry && (
        <div className="space-y-3">
          {entry.photo_url && (
            <img src={entry.photo_url} alt="" className="max-h-48 w-full rounded-xl object-cover" />
          )}
          <Field label="Title">
            <TextInput
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>

          {entry.assumptions && (
            <div className="rounded-xl bg-[var(--surface-2)] p-2.5 text-xs text-[var(--text-dim)]">
              AI assumed: {entry.assumptions}
            </div>
          )}

          {items.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-[var(--text-dim)]">
                Items — adjust a quantity and the totals below update
              </div>
              {items.map((it, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2"
                >
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={it.qtyStr}
                    onChange={(e) => setQty(i, e.target.value)}
                    className="w-14 flex-none rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-1 text-center text-sm outline-none focus:border-[var(--pro)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      {it.name}
                      {it.unit ? <span className="text-[var(--text-dim)]"> ({it.unit})</span> : null}
                    </div>
                    <div className="text-[11px] text-[var(--text-dim)]">
                      {Math.round(scaled[i].calories)} kcal ·{" "}
                      <span className="text-[var(--pro)]">{Math.round(scaled[i].protein_g)}g P</span>{" "}
                      · {Math.round(scaled[i].carbs_g)}g C · {Math.round(scaled[i].fat_g)}g F
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["calories", "Calories"],
                ["protein_g", "Protein (g)"],
                ["carbs_g", "Carbs (g)"],
                ["fat_g", "Fat (g)"],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <TextInput
                  type="number"
                  inputMode="numeric"
                  value={macros[k]}
                  onChange={(e) => setMacros({ ...macros, [k]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <Field label="Creatine (g, optional)">
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.5"
              value={macros.creatine_g}
              onChange={(e) => setMacros({ ...macros, creatine_g: e.target.value })}
            />
          </Field>

          <Field label="Description (used if you re-estimate)">
            <TextInput
              value={form.user_text}
              onChange={(e) => setForm({ ...form, user_text: e.target.value })}
            />
          </Field>
          <Field label="When">
            <TextInput
              type="datetime-local"
              value={form.occurred_at}
              onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
            />
          </Field>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Spinner /> : "Save"}
            </Button>
            <Button
              variant="subtle"
              onClick={() => reestimate.mutate()}
              disabled={reestimate.isPending}
            >
              {reestimate.isPending ? <Spinner /> : "Re-estimate"}
            </Button>
            <Button variant="subtle" onClick={() => saveFav.mutate()} disabled={saveFav.isPending}>
              {saveFav.isSuccess ? "Saved ★" : "Save as favourite"}
            </Button>
            <Button variant="danger" onClick={() => del.mutate()} disabled={del.isPending}>
              Delete
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}
