import { useState } from "react";
import { Button, Field, Sheet, Spinner, TextInput } from "../ui";
import { ExercisePickerField } from "./ExercisePickerField";
import { useReplaceTemplateItems, useUpsertTemplate } from "../../lib/queries";
import { groupTemplateItems } from "../../lib/workout";
import type { WorkoutTemplate } from "../../types";

type Pick = { key: string; name: string; catalog_id: string | null };
type Slot = Pick & {
  target_sets: string;
  target_reps: string;
  target_rpe: string;
  alts: Pick[];
};

const rid = () => Math.random().toString(36).slice(2);
const blankPick = (): Pick => ({ key: rid(), name: "", catalog_id: null });
const blankSlot = (): Slot => ({
  ...blankPick(),
  target_sets: "",
  target_reps: "",
  target_rpe: "",
  alts: [],
});

export function TemplateEditor({
  template,
  onClose,
}: {
  template: WorkoutTemplate | null;
  onClose: () => void;
}) {
  const upsert = useUpsertTemplate();
  const replaceItems = useReplaceTemplateItems();
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [slots, setSlots] = useState<Slot[]>(
    template && template.items.length
      ? groupTemplateItems(template.items).map(({ primary, alternatives }) => ({
          key: primary.id,
          name: primary.name,
          catalog_id: primary.catalog_id,
          target_sets: primary.target_sets == null ? "" : String(primary.target_sets),
          target_reps: primary.target_reps ?? "",
          target_rpe: primary.target_rpe == null ? "" : String(primary.target_rpe),
          alts: alternatives.map((a) => ({
            key: a.id,
            name: a.name,
            catalog_id: a.catalog_id,
          })),
        }))
      : [blankSlot()],
  );

  const busy = upsert.isPending || replaceItems.isPending;

  const setSlot = (key: string, patch: Partial<Slot>) =>
    setSlots((ss) => ss.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const setAlt = (slotKey: string, altKey: string, patch: Partial<Pick>) =>
    setSlots((ss) =>
      ss.map((s) =>
        s.key === slotKey
          ? { ...s, alts: s.alts.map((a) => (a.key === altKey ? { ...a, ...patch } : a)) }
          : s,
      ),
    );
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= slots.length) return;
    setSlots((ss) => {
      const next = ss.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const save = async () => {
    if (!name.trim()) return;
    const saved = await upsert.mutateAsync({
      id: template?.id,
      name: name.trim(),
      description: description.trim() || null,
    });
    await replaceItems.mutateAsync({
      id: saved.id,
      items: slots
        .filter((s) => s.name.trim())
        .map((s, position) => ({
          name: s.name.trim(),
          catalog_id: s.catalog_id,
          target_sets: s.target_sets ? Number(s.target_sets) : null,
          target_reps: s.target_reps.trim() || null,
          target_rpe: s.target_rpe ? Number(s.target_rpe) : null,
          position,
          alternatives: s.alts
            .filter((a) => a.name.trim())
            .map((a) => ({ name: a.name.trim(), catalog_id: a.catalog_id })),
        })),
    });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={template ? "Edit baseline" : "New baseline"}>
      <div className="space-y-3">
        <Field label="Name">
          <TextInput
            autoFocus
            placeholder="e.g. Upper 1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Notes (optional)">
          <TextInput
            placeholder="focus, order, cues…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <div className="space-y-2">
          <div className="text-xs font-medium text-[var(--text-dim)]">Exercises</div>
          {slots.map((s, i) => (
            <div key={s.key} className="rounded-lg border border-[var(--border)] p-2">
              <ExercisePickerField
                value={{ name: s.name, catalog_id: s.catalog_id }}
                onChange={(v) => setSlot(s.key, v)}
              />
              <div className="mt-1.5 flex items-center gap-1.5">
                <input
                  inputMode="numeric"
                  placeholder="sets"
                  value={s.target_sets}
                  onChange={(e) =>
                    setSlot(s.key, { target_sets: e.target.value.replace(/\D/g, "") })
                  }
                  className="w-12 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-1.5 text-center text-sm outline-none"
                />
                <span className="text-xs text-[var(--text-dim)]">×</span>
                <input
                  placeholder="reps"
                  value={s.target_reps}
                  onChange={(e) => setSlot(s.key, { target_reps: e.target.value })}
                  className="w-16 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-1.5 text-center text-sm outline-none"
                />
                <input
                  inputMode="decimal"
                  placeholder="RPE"
                  value={s.target_rpe}
                  onChange={(e) =>
                    setSlot(s.key, { target_rpe: e.target.value.replace(/[^\d.]/g, "") })
                  }
                  className="w-12 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-1.5 text-center text-sm outline-none"
                />
                <div className="ml-auto flex items-center gap-0.5 text-[var(--text-dim)]">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="px-1 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === slots.length - 1}
                    className="px-1 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() =>
                      setSlots((ss) =>
                        ss.length > 1 ? ss.filter((x) => x.key !== s.key) : ss,
                      )
                    }
                    className="px-1 text-[var(--warn)]"
                    aria-label="Remove exercise"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {s.alts.map((a) => (
                <div key={a.key} className="mt-1.5 flex items-center gap-1.5 pl-4">
                  <span className="text-[11px] text-[var(--text-dim)]">or</span>
                  <div className="flex-1">
                    <ExercisePickerField
                      placeholder="Alternative"
                      value={{ name: a.name, catalog_id: a.catalog_id }}
                      onChange={(v) => setAlt(s.key, a.key, v)}
                    />
                  </div>
                  <button
                    onClick={() =>
                      setSlot(s.key, { alts: s.alts.filter((x) => x.key !== a.key) })
                    }
                    className="px-1 text-[var(--warn)]"
                    aria-label="Remove alternative"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => setSlot(s.key, { alts: [...s.alts, blankPick()] })}
                className="mt-1.5 pl-4 text-[11px] text-[var(--text-dim)] underline"
              >
                ＋ alternative
              </button>
            </div>
          ))}
          <button
            onClick={() => setSlots((ss) => [...ss, blankSlot()])}
            className="w-full rounded-lg border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-dim)]"
          >
            ＋ Add exercise
          </button>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" disabled={!name.trim() || busy} onClick={save}>
            {busy ? <Spinner /> : "Save"}
          </Button>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
