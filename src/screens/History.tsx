import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useStats } from "../lib/queries";
import { Card, EmptyState } from "../components/ui";
import { EntryRow } from "../components/EntryRow";
import { EntryEditor } from "./EntryEditor";
import { Screen } from "../App";
import type { Entry, MealsListResponse } from "../types";
import { relativeDay } from "../lib/format";
import { todayISO } from "../lib/day";

export function History() {
  const stats = useStats(30);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const today = todayISO();

  const days = [...(stats.data?.daily ?? [])].reverse();

  return (
    <Screen title="History">
      {days.length === 0 && <EmptyState>No history yet.</EmptyState>}
      <div className="space-y-2">
        {days.map((d) => {
          const calOver = d.calorie_target ? d.calories - d.calorie_target : 0;
          return (
            <div key={d.date}>
              <button
                onClick={() => setOpen(open === d.date ? null : d.date)}
                className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left"
              >
                <div>
                  <div className="text-sm font-medium">{relativeDay(d.date, today)}</div>
                  <div className="text-xs text-[var(--text-dim)]">
                    {d.logged ? (
                      <>
                        {Math.round(d.calories)} kcal
                        {d.calorie_target ? (
                          <span className={calOver > d.calorie_target * 0.1 ? " text-[var(--warn)]" : ""}>
                            {" "}
                            / {d.calorie_target}
                          </span>
                        ) : null}{" "}
                        · <span className="text-[var(--pro)]">{Math.round(d.protein_g)}g P</span>
                        {d.protein_target_g ? ` / ${d.protein_target_g}` : ""}
                      </>
                    ) : (
                      "not logged"
                    )}
                  </div>
                </div>
                <span className="text-[var(--text-dim)]">{open === d.date ? "▾" : "▸"}</span>
              </button>
              {open === d.date && (
                <DayEntries date={d.date} onEdit={setEditing} />
              )}
            </div>
          );
        })}
      </div>
      <EntryEditor entry={editing} onClose={() => setEditing(null)} />
    </Screen>
  );
}

function DayEntries({ date, onEdit }: { date: string; onEdit: (e: Entry) => void }) {
  const q = useQuery({
    queryKey: ["meals", date],
    queryFn: () => api.get<MealsListResponse>(`/api/meals?date=${date}`),
  });
  return (
    <Card className="mt-1.5 space-y-2">
      {q.data?.entries.length === 0 && (
        <p className="text-xs text-[var(--text-dim)]">Nothing logged this day.</p>
      )}
      {q.data?.entries.map((e) => (
        <EntryRow key={e.id} entry={e} onClick={() => onEdit(e)} />
      ))}
    </Card>
  );
}
