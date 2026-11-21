import { useMemo, useState } from "react";
import { Button, Card, Sheet, Spinner, TextInput } from "../ui";
import {
  useApplyExerciseRename,
  useExerciseNames,
  useSuggestExerciseNames,
  useUndoExerciseRename,
} from "../../lib/queries";
import type { ExerciseCleanupSuggestion, LoggedExercise } from "../../types";

const fmtDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** Entry point on the Gym tab: how many names are logged, and the clean-up sheet. */
export function ExerciseNamesCard() {
  const q = useExerciseNames();
  const [open, setOpen] = useState(false);
  const n = q.data?.logged.length ?? 0;

  return (
    <Card className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold">Exercise names</h2>
        <p className="text-xs text-[var(--text-dim)]">
          {q.isLoading ? "…" : `${n} different names logged.`} Merge duplicates and fix typos so
          progress is tracked under one name.
        </p>
      </div>
      <Button variant="subtle" className="shrink-0" onClick={() => setOpen(true)}>
        Clean up
      </Button>
      {open && <CleanupSheet onClose={() => setOpen(false)} />}
    </Card>
  );
}

function CleanupSheet({ onClose }: { onClose: () => void }) {
  const q = useExerciseNames();
  const suggest = useSuggestExerciseNames();
  const apply = useApplyExerciseRename();
  const undo = useUndoExerciseRename();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manualName, setManualName] = useState("");
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const logged = q.data?.logged ?? [];
  const byNorm = useMemo(() => new Map(logged.map((l) => [l.norm_name, l])), [logged]);
  const renames = q.data?.renames ?? [];
  const latestActive = renames.find((r) => !r.undone_at)?.id;
  const suggestions = (suggest.data?.suggestions ?? [])
    .map((s, i) => ({ s, i }))
    // Hide ones already applied/skipped, or whose names no longer exist after another merge.
    .filter(({ s, i }) => !dismissed.has(i) && s.members.every((m) => byNorm.has(m)));

  const run = async (from: string[], to_name: string, catalog_id?: string | null) => {
    setMsg(null);
    try {
      const r = await apply.mutateAsync({ from, to_name, catalog_id });
      setMsg(`Renamed ${r.exercises} logged exercise${r.exercises === 1 ? "" : "s"} (${r.sets} sets) to “${r.to_name}”.`);
      return true;
    } catch (e) {
      setMsg(`Couldn’t rename: ${(e as Error).message}`);
      return false;
    }
  };

  const shown = logged.filter(
    (l) => !filter || l.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Sheet open onClose={onClose} title="Clean up exercise names">
      <div className="space-y-5">
        <p className="text-xs text-[var(--text-dim)]">
          Renaming changes every past workout, set and saved workout logged under that name.
          Merging two names combines their history. Each change can be undone below.
        </p>

        {msg && <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs">{msg}</p>}

        {/* ---- AI suggestions ---- */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">AI suggestions</h3>
            <Button
              variant="subtle"
              disabled={suggest.isPending || !logged.length}
              onClick={() => {
                setDismissed(new Set());
                suggest.mutate();
              }}
            >
              {suggest.isPending ? <Spinner /> : suggest.data ? "Ask again" : "Suggest"}
            </Button>
          </div>
          {suggest.isError && (
            <p className="text-xs text-[var(--warn)]">{(suggest.error as Error).message}</p>
          )}
          {suggest.data?.partial && (
            <p className="text-xs text-[var(--warn)]">
              Part of the AI request failed, so some names weren’t checked — tap “Ask again” for
              the rest.
            </p>
          )}
          {suggest.data && suggestions.length === 0 && (
            <p className="text-xs text-[var(--text-dim)]">No (more) suggestions — names look consistent.</p>
          )}
          {suggestions.map(({ s, i }) => (
            <SuggestionRow
              key={i}
              s={s}
              byNorm={byNorm}
              busy={apply.isPending}
              onApply={async (name) => {
                if (await run(s.members, name, name === s.to_name ? s.catalog_id : null)) {
                  setDismissed((d) => new Set(d).add(i));
                }
              }}
              onSkip={() => setDismissed((d) => new Set(d).add(i))}
            />
          ))}
          {!suggest.data && (
            <p className="text-xs text-[var(--text-dim)]">
              The AI only proposes merging spelling or wording variants of the same exercise
              on the same equipment. Nothing changes until you tap Apply, and you can edit the
              name first.
            </p>
          )}
        </section>

        {/* ---- manual ---- */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">All logged names</h3>
          <p className="text-xs text-[var(--text-dim)]">
            Tick one to rename it, or several to merge them under one name.
          </p>
          <TextInput placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {shown.map((l) => (
              <label
                key={l.norm_name}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-2)]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(l.norm_name)}
                  onChange={() =>
                    setSelected((sel) => {
                      const next = new Set(sel);
                      if (next.has(l.norm_name)) next.delete(l.norm_name);
                      else next.add(l.norm_name);
                      return next;
                    })
                  }
                />
                <span className="flex-1 text-sm">{l.name}</span>
                <span className="text-[11px] text-[var(--text-dim)]">
                  {l.sessions}× · last {fmtDate(l.last_done)}
                </span>
              </label>
            ))}
          </div>
          {selected.size > 0 && (
            <div className="space-y-2 rounded-xl bg-[var(--surface-2)] p-3">
              <p className="text-xs">
                {selected.size === 1 ? "Rename" : `Merge ${selected.size} names`}:{" "}
                <span className="text-[var(--text-dim)]">
                  {[...selected].map((n) => byNorm.get(n)?.name ?? n).join(", ")}
                </span>
              </p>
              <div className="flex gap-2">
                <TextInput
                  placeholder="New name"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                />
                <Button
                  disabled={!manualName.trim() || apply.isPending}
                  onClick={async () => {
                    if (await run([...selected], manualName.trim())) {
                      setSelected(new Set());
                      setManualName("");
                    }
                  }}
                >
                  {apply.isPending ? <Spinner /> : "Apply"}
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* ---- history / undo ---- */}
        {renames.length > 0 && (
          <section className="space-y-1">
            <h3 className="text-sm font-semibold">Recent changes</h3>
            {renames.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
                <span className={r.undone_at ? "text-[var(--text-dim)] line-through" : ""}>
                  {r.from.join(", ")} → <b>{r.to_name}</b>
                  <span className="text-[var(--text-dim)]"> · {fmtDate(r.created_at)}</span>
                </span>
                {r.id === latestActive && (
                  <button
                    className="shrink-0 underline"
                    disabled={undo.isPending}
                    onClick={async () => {
                      setMsg(null);
                      try {
                        await undo.mutateAsync(r.id);
                        setMsg(`Undid “${r.to_name}”.`);
                      } catch (e) {
                        setMsg(`Couldn’t undo: ${(e as Error).message}`);
                      }
                    }}
                  >
                    Undo
                  </button>
                )}
              </div>
            ))}
            <p className="text-[11px] text-[var(--text-dim)]">Changes are undone newest first.</p>
          </section>
        )}
      </div>
    </Sheet>
  );
}

function SuggestionRow({
  s,
  byNorm,
  busy,
  onApply,
  onSkip,
}: {
  s: ExerciseCleanupSuggestion;
  byNorm: Map<string, LoggedExercise>;
  busy: boolean;
  onApply: (name: string) => void;
  onSkip: () => void;
}) {
  const [name, setName] = useState(s.to_name);
  return (
    <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
      <div className="text-xs">
        {s.members.map((m) => {
          const l = byNorm.get(m);
          return (
            <div key={m}>
              {l?.name ?? m} <span className="text-[var(--text-dim)]">· {l?.sessions ?? 0}×</span>
            </div>
          );
        })}
        <div className="mt-1 text-[var(--text-dim)]">{s.reason}</div>
      </div>
      <div className="flex gap-2">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        <Button disabled={busy || !name.trim()} onClick={() => onApply(name.trim())}>
          Apply
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}
