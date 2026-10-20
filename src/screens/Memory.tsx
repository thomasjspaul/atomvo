import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { useDeleteTemplate, useMemory, useWorkoutTemplates } from "../lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Card, EmptyState, Field, Spinner, TextInput } from "../components/ui";
import { TemplateEditor } from "../components/workout/TemplateEditor";
import { groupTemplateItems } from "../lib/workout";
import { Screen } from "../App";
import type { MemoryNote, WorkoutTemplate } from "../types";

export function Memory() {
  const mem = useMemory();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["memory"] });
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");

  const add = useMutation({
    mutationFn: () => api.post("/api/memory", { text, category: category || undefined }),
    onSuccess: () => {
      setText("");
      setCategory("");
      invalidate();
    },
  });

  const act = useMutation({
    mutationFn: ({ id, path }: { id: string; path: string }) => api.post(`/api/memory/${id}/${path}`),
    onSuccess: invalidate,
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/api/memory/${id}`, body),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/memory/${id}`),
    onSuccess: invalidate,
  });

  const templates = useWorkoutTemplates();
  const delTemplate = useDeleteTemplate();
  const [tplEditing, setTplEditing] = useState<WorkoutTemplate | null>(null);
  const [tplNew, setTplNew] = useState(false);
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmDelId) return;
    const t = setTimeout(() => setConfirmDelId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDelId]);

  return (
    <Screen title="Memory">
      <p className="mb-3 text-sm text-[var(--text-dim)]">
        Facts the coach uses — dietary pattern, dislikes, go-to meals, schedule. The coach may
        suggest new ones; you decide what sticks.
      </p>

      {(mem.data?.suggested.length ?? 0) > 0 && (
        <div className="mb-4">
          <h2 className="mb-2 text-xs font-semibold uppercase text-[var(--text-dim)]">
            Suggested by coach
          </h2>
          <div className="space-y-2">
            {mem.data!.suggested.map((n) => (
              <Card key={n.id} className="text-sm">
                <div className="mb-2">“{n.text}”</div>
                <div className="flex gap-2">
                  <Button onClick={() => act.mutate({ id: n.id, path: "accept" })}>Remember</Button>
                  <Button variant="subtle" onClick={() => act.mutate({ id: n.id, path: "reject" })}>
                    Dismiss
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card className="mb-4 space-y-2">
        <Field label="Add a note">
          <TextInput
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Vegetarian on weekdays"
          />
        </Field>
        <div className="flex gap-2">
          <TextInput
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="category (optional)"
          />
          <Button onClick={() => add.mutate()} disabled={!text.trim() || add.isPending}>
            {add.isPending ? <Spinner /> : "Add"}
          </Button>
        </div>
      </Card>

      <h2 className="mb-2 text-xs font-semibold uppercase text-[var(--text-dim)]">Active</h2>
      <div className="space-y-2">
        {mem.data?.active.length === 0 && <EmptyState>No notes yet.</EmptyState>}
        {mem.data?.active.map((n) => (
          <NoteRow
            key={n.id}
            note={n}
            onSave={(body) => patch.mutate({ id: n.id, body })}
            onArchive={() => patch.mutate({ id: n.id, body: { status: "archived" } })}
          />
        ))}
      </div>

      <h2 className="mb-2 mt-5 text-xs font-semibold uppercase text-[var(--text-dim)]">
        Baseline workouts
      </h2>
      <p className="mb-2 text-[11px] text-[var(--text-dim)]">
        Reusable session plans (Upper 1, Lower 1…). Start one from the Gym tab.
      </p>
      <div className="space-y-2">
        {templates.data?.templates.length === 0 && (
          <EmptyState>No baseline workouts yet.</EmptyState>
        )}
        {templates.data?.templates.map((t) => (
          <Card key={t.id} className="text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">{t.name}</div>
                {t.description && (
                  <div className="text-[11px] text-[var(--text-dim)]">{t.description}</div>
                )}
              </div>
              <span className="flex flex-none gap-2 text-[11px] text-[var(--text-dim)]">
                <button onClick={() => setTplEditing(t)}>edit</button>
                {confirmDelId === t.id ? (
                  <button
                    className="text-[var(--warn)]"
                    onClick={() => delTemplate.mutate(t.id)}
                  >
                    confirm
                  </button>
                ) : (
                  <button
                    className="text-[var(--warn)]"
                    onClick={() => setConfirmDelId(t.id)}
                  >
                    delete
                  </button>
                )}
              </span>
            </div>
            {t.items.length > 0 && (
              <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-[11px] text-[var(--text-dim)]">
                {groupTemplateItems(t.items).map(({ primary, alternatives }) => (
                  <li key={primary.id}>
                    {primary.name}
                    {primary.target_sets != null &&
                      ` — ${primary.target_sets}${
                        primary.target_reps ? ` × ${primary.target_reps}` : ""
                      }${primary.target_rpe != null ? ` @ RPE ${primary.target_rpe}` : ""}`}
                    {alternatives.length > 0 && (
                      <span className="italic">
                        {" "}
                        · or {alternatives.map((a) => a.name).join(", ")}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        ))}
        <button
          onClick={() => setTplNew(true)}
          className="w-full rounded-xl border border-dashed border-[var(--border)] py-2 text-sm text-[var(--text-dim)]"
        >
          ＋ New baseline
        </button>
      </div>

      {tplNew && <TemplateEditor template={null} onClose={() => setTplNew(false)} />}
      {tplEditing && (
        <TemplateEditor template={tplEditing} onClose={() => setTplEditing(null)} />
      )}

      {(mem.data?.archived.length ?? 0) > 0 && (
        <>
          <h2 className="mb-2 mt-5 text-xs font-semibold uppercase text-[var(--text-dim)]">
            Archived
          </h2>
          <div className="space-y-2">
            {mem.data!.archived.map((n) => (
              <Card key={n.id} className="flex items-center justify-between text-sm text-[var(--text-dim)]">
                <span className="line-through">{n.text}</span>
                <span className="flex gap-2">
                  <button
                    className="text-[var(--text)]"
                    onClick={() => patch.mutate({ id: n.id, body: { status: "active" } })}
                  >
                    restore
                  </button>
                  <button className="text-[var(--warn)]" onClick={() => del.mutate(n.id)}>
                    delete
                  </button>
                </span>
              </Card>
            ))}
          </div>
        </>
      )}
    </Screen>
  );
}

function NoteRow({
  note,
  onSave,
  onArchive,
}: {
  note: MemoryNote;
  onSave: (body: Record<string, unknown>) => void;
  onArchive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);

  return (
    <Card className="text-sm">
      {editing ? (
        <div className="space-y-2">
          <TextInput value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            <Button
              onClick={() => {
                onSave({ text });
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button variant="subtle" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div>
            <div>{note.text}</div>
            {note.category && (
              <div className="mt-0.5 text-[11px] text-[var(--text-dim)]">{note.category}</div>
            )}
          </div>
          <span className="flex flex-none gap-2 text-[11px] text-[var(--text-dim)]">
            <button onClick={() => setEditing(true)}>edit</button>
            <button onClick={onArchive}>archive</button>
          </span>
        </div>
      )}
    </Card>
  );
}
