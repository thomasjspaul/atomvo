import { useState } from "react";
import type { WorkoutSessionDetail } from "../../types";
import { sessionTitle, sessionToPlainText, setSummary } from "../../lib/workout";
import { relativeDay } from "../../lib/format";
import { todayISO } from "../../lib/day";

export function WorkoutSessionView({
  session,
  imperial,
  onEdit,
}: {
  session: WorkoutSessionDetail;
  imperial: boolean;
  onEdit?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyText = async () => {
    await navigator.clipboard.writeText(sessionToPlainText(session, imperial));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{sessionTitle(session)}</div>
          <div className="text-[11px] text-[var(--text-dim)]">
            {relativeDay(session.tracking_date, todayISO())}
            {session.gym_name && ` · ${session.gym_name}`}
          </div>
        </div>
        <div className="flex flex-none items-center gap-2">
          <button
            onClick={copyText}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-dim)]"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          {onEdit && (
            <button
              onClick={onEdit}
              className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-dim)]"
            >
              Edit
            </button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {session.exercises.map((ex) => (
          <div key={ex.id} className="rounded-lg bg-[var(--surface-2)] px-2.5 py-2 text-sm">
            <div className="font-medium">{ex.name}</div>
            {ex.sets.length ? (
              <div className="mt-0.5 space-y-0.5 text-[11px] text-[var(--text-dim)]">
                {ex.sets.map((s) => (
                  <div key={s.id}>
                    <span className="tabular-nums">{s.is_warmup ? "W" : s.set_number}.</span>{" "}
                    {setSummary(s, imperial)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-[var(--text-dim)]">no sets logged</div>
            )}
          </div>
        ))}
        {session.exercises.length === 0 && (
          <p className="text-sm text-[var(--text-dim)]">No exercises logged.</p>
        )}
      </div>
    </div>
  );
}
