import { useEffect, useState } from "react";
import {
  useDeleteFavourite,
  useFavourites,
  useLogFavourite,
  useUpsertFavourite,
} from "../lib/queries";
import { Button, Card, EmptyState, Field, Spinner, TextInput } from "../components/ui";
import { Screen } from "../App";
import type { Favourite } from "../types";

export function Favourites() {
  const favs = useFavourites();
  const logFav = useLogFavourite();
  const [editing, setEditing] = useState<Favourite | null>(null);
  const [creating, setCreating] = useState(false);

  const close = () => {
    setEditing(null);
    setCreating(false);
  };

  return (
    <Screen title="Favourites">
      <p className="mb-3 text-sm text-[var(--text-dim)]">
        One tap to log. Tap a favourite to edit it, or add one by hand below.
      </p>

      <Button variant="subtle" className="mb-3 w-full" onClick={() => setCreating(true)}>
        ＋ New favourite
      </Button>

      <div className="space-y-2">
        {favs.data?.favourites.length === 0 && (
          <EmptyState>
            Nothing saved yet. Add one above, or tick “save as favourite” when you log a meal.
          </EmptyState>
        )}
        {favs.data?.favourites.map((f) => (
          <Card key={f.id} className="flex items-center gap-3">
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => setEditing(f)}
            >
              <div className="text-sm font-medium">{f.name}</div>
              <div className="text-xs text-[var(--text-dim)]">
                {Math.round(f.calories)} kcal · {Math.round(f.protein_g)}g P ·{" "}
                {Math.round(f.carbs_g)}g C · {Math.round(f.fat_g)}g F
                {f.creatine_g ? ` · ${f.creatine_g}g creatine` : ""} · used {f.use_count}×
              </div>
            </button>
            <button
              onClick={() => logFav.mutate({ id: f.id })}
              disabled={logFav.isPending}
              className="rounded-lg bg-[var(--pro)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
            >
              Log
            </button>
          </Card>
        ))}
      </div>

      {logFav.isPending && (
        <p className="mt-2 text-xs text-[var(--text-dim)]">
          <Spinner /> logging…
        </p>
      )}

      {(editing || creating) && (
        <FavEditor fav={editing} isNew={creating} onClose={close} />
      )}
    </Screen>
  );
}

const MACRO_KEYS = ["calories", "protein_g", "carbs_g", "fat_g"] as const;

function FavEditor({
  fav,
  isNew,
  onClose,
}: {
  fav: Favourite | null;
  isNew: boolean;
  onClose: () => void;
}) {
  const upsert = useUpsertFavourite();
  const del = useDeleteFavourite();
  const [f, setF] = useState<Record<string, string>>({});
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    setF(
      fav
        ? {
            name: fav.name,
            calories: String(Math.round(fav.calories)),
            protein_g: String(Math.round(fav.protein_g)),
            carbs_g: String(Math.round(fav.carbs_g)),
            fat_g: String(Math.round(fav.fat_g)),
            creatine_g: fav.creatine_g == null ? "" : String(fav.creatine_g),
          }
        : { name: "", calories: "", protein_g: "", carbs_g: "", fat_g: "", creatine_g: "" },
    );
    setConfirmDel(false);
  }, [fav, isNew]);

  useEffect(() => {
    if (!confirmDel) return;
    const t = setTimeout(() => setConfirmDel(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDel]);

  function save() {
    const name = (f.name ?? "").trim();
    if (!name) return;
    upsert.mutate(
      {
        id: fav?.id,
        name,
        calories: Number(f.calories) || 0,
        protein_g: Number(f.protein_g) || 0,
        carbs_g: Number(f.carbs_g) || 0,
        fat_g: Number(f.fat_g) || 0,
        creatine_g: (f.creatine_g ?? "").trim() === "" ? null : Number(f.creatine_g),
      },
      { onSuccess: onClose },
    );
  }

  function remove() {
    if (!fav) return;
    if (!confirmDel) {
      setConfirmDel(true);
      return;
    }
    del.mutate(fav.id, { onSuccess: onClose });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl border border-[var(--border)] bg-[var(--surface)] p-4 pb-safe">
        <h2 className="mb-3 text-base font-semibold">
          {isNew ? "New favourite" : "Edit favourite"}
        </h2>
        <div className="space-y-3">
          <Field label="Name">
            <TextInput
              autoFocus={isNew}
              value={f.name ?? ""}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-4 gap-2">
            {MACRO_KEYS.map((k) => (
              <Field key={k} label={k === "calories" ? "kcal" : k[0].toUpperCase()}>
                <TextInput
                  type="number"
                  inputMode="numeric"
                  value={f[k] ?? ""}
                  onChange={(e) => setF({ ...f, [k]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <Field label="Creatine (g, optional)">
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.5"
              value={f.creatine_g ?? ""}
              onChange={(e) => setF({ ...f, creatine_g: e.target.value })}
            />
          </Field>
          {upsert.isError && (
            <p className="text-xs text-[var(--warn)]">{(upsert.error as Error).message}</p>
          )}
          <div className="flex gap-2">
            <Button
              onClick={save}
              disabled={upsert.isPending || !(f.name ?? "").trim()}
              className="flex-1"
            >
              {upsert.isPending ? <Spinner /> : "Save"}
            </Button>
            {!isNew && (
              <Button variant="danger" onClick={remove} disabled={del.isPending}>
                {del.isPending ? <Spinner /> : confirmDel ? "Tap to confirm" : "Delete"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
