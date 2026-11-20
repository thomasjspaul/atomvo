import { useEffect, useMemo, useState } from "react";
import { useExerciseCatalog } from "../../lib/queries";
import { searchExerciseCatalog } from "../../lib/workout";

/** Slim inline exercise input with an instant catalog dropdown (searched in the
 *  browser). Free text is allowed (catalog_id stays null until a suggestion is picked). */
export function ExercisePickerField({
  value,
  onChange,
  placeholder,
}: {
  value: { name: string; catalog_id: string | null };
  onChange: (v: { name: string; catalog_id: string | null }) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value.name);
  const [open, setOpen] = useState(false);
  const catalog = useExerciseCatalog();

  useEffect(() => setText(value.name), [value.name]);

  const results = useMemo(
    () =>
      open && text.trim().length >= 2
        ? searchExerciseCatalog(catalog.data?.exercises ?? [], text, { limit: 12 }).map((e) => ({
            catalog_id: e.id,
            canonical_name: e.name,
            primary_muscle: e.muscle,
            equipment: e.equipment,
          }))
        : [],
    [open, text, catalog.data],
  );

  return (
    <div className="relative">
      <input
        value={text}
        placeholder={placeholder ?? "Exercise"}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          onChange({ name: e.target.value, catalog_id: null });
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 pr-7 text-sm outline-none focus:border-[var(--pro)]"
      />
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 text-sm shadow-lg">
          {results.map((s, i) => (
            <button
              key={`${s.catalog_id ?? s.canonical_name}-${i}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange({ name: s.canonical_name, catalog_id: s.catalog_id });
                setText(s.canonical_name);
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left"
            >
              {s.canonical_name}
              <span className="ml-2 text-[11px] text-[var(--text-dim)]">
                {[s.primary_muscle, s.equipment].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
