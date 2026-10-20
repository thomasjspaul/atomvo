import { useState } from "react";
import { Screen } from "../App";
import { Button, Card, Sheet, Spinner } from "../components/ui";
import {
  useActiveWorkout,
  useSettings,
  useStartTemplate,
  useStartWorkout,
  useWorkoutHistory,
  useWorkoutSession,
  useWorkoutTemplates,
} from "../lib/queries";
import { ActiveSessionView } from "../components/workout/ActiveSessionView";
import { WorkoutSessionView } from "../components/workout/WorkoutSessionView";
import { EditSessionView } from "../components/workout/EditSessionView";
import { relativeDay } from "../lib/format";
import { todayISO } from "../lib/day";

export function Workout() {
  const active = useActiveWorkout();
  const settings = useSettings();
  const imperial = (settings.data?.settings.units ?? "imperial") === "imperial";

  return (
    <Screen title="Gym">
      {active.isLoading ? (
        <div className="py-10 text-center text-[var(--text-dim)]">
          <Spinner />
        </div>
      ) : active.data?.session ? (
        <ActiveSessionView session={active.data.session} imperial={imperial} />
      ) : (
        <StartView imperial={imperial} />
      )}
    </Screen>
  );
}

function StartView({ imperial }: { imperial: boolean }) {
  const start = useStartWorkout();
  const startTemplate = useStartTemplate();
  const templates = useWorkoutTemplates();
  const history = useWorkoutHistory(undefined, undefined, 8);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const today = todayISO();
  // Defaults to today; pick an earlier day to log a workout after the fact.
  const [date, setDate] = useState(today);
  const tracking_date = date && date <= today ? date : today;

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-xs font-medium text-[var(--text-dim)]">Date</span>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-right outline-none"
          />
        </label>
        <Button
          className="w-full"
          disabled={start.isPending}
          onClick={() => start.mutate({ tracking_date })}
        >
          {start.isPending ? (
            <Spinner />
          ) : tracking_date === today ? (
            "Start workout"
          ) : (
            `Log workout for ${relativeDay(tracking_date, today)}`
          )}
        </Button>
      </Card>

      {(templates.data?.templates.length ?? 0) > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase text-[var(--text-dim)]">
            Baseline workouts
          </div>
          <div className="space-y-2">
            {templates.data!.templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-[11px] text-[var(--text-dim)]">
                    {t.items.length} exercise{t.items.length === 1 ? "" : "s"}
                  </div>
                </div>
                <Button
                  variant="subtle"
                  disabled={startTemplate.isPending}
                  onClick={() =>
                    startTemplate.mutate({ templateId: t.id, tracking_date })
                  }
                >
                  Start
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-[var(--text-dim)]">
          Recent workouts
        </div>
        {history.data?.sessions.length ? (
          <div className="space-y-2">
            {history.data.sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setViewingId(s.id)}
                className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{s.title || "Workout"}</div>
                  <div className="text-[11px] text-[var(--text-dim)]">
                    {relativeDay(s.tracking_date, todayISO())}
                  </div>
                </div>
                <span className="text-[11px] text-[var(--text-dim)]">
                  {s.exercise_count} ex · {s.set_count} sets
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-dim)]">No finished workouts yet.</p>
        )}
      </div>

      {viewingId && (
        <SessionViewSheet
          sessionId={viewingId}
          imperial={imperial}
          onClose={() => setViewingId(null)}
        />
      )}
    </div>
  );
}

function SessionViewSheet({
  sessionId,
  imperial,
  onClose,
}: {
  sessionId: string;
  imperial: boolean;
  onClose: () => void;
}) {
  const q = useWorkoutSession(sessionId);
  const [editing, setEditing] = useState(false);
  return (
    <Sheet open onClose={onClose} title="Workout">
      {q.isLoading || !q.data ? (
        <div className="py-6 text-center">
          <Spinner />
        </div>
      ) : editing ? (
        <EditSessionView
          session={q.data}
          imperial={imperial}
          onDone={() => setEditing(false)}
          onDeleted={onClose}
        />
      ) : (
        <WorkoutSessionView
          session={q.data}
          imperial={imperial}
          onEdit={() => setEditing(true)}
        />
      )}
    </Sheet>
  );
}
