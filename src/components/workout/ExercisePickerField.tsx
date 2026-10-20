import { useEffect, useState } from "react";
import { Spinner } from "../ui";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { useExerciseSuggest } from "../../lib/queries";

/** Slim inline exercise input with a debounced catalog dropdown. Free text is
 *  allowed (catalog_id stays null until a suggestion is picked). */
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
  const debounced = useDebouncedValue(text.trim(), 250);
  const suggest = useExerciseSuggest(open ? debounced : "");

  useEffect(() => setText(value.name), [value.name]);

  const results = suggest.data?.suggestions ?? [];

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
      {open && suggest.isFetching && (
        <span className="pointer-events-none absolute right-2 top-2.5 text-[var(--text-dim)]">
          <Spinner className="h-3.5 w-3.5" />
        </span>
      )}
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
