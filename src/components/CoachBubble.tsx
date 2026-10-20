import type { CoachMessage } from "../types";
import { timeOfDay } from "../lib/format";

export function CoachBubble({ msg }: { msg: CoachMessage }) {
  return (
    <div className="flex gap-2.5">
      <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[var(--pro)]/15 text-sm">
        🍽️
      </div>
      <div className="rounded-2xl rounded-tl-sm border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm">
        {msg.text}
        <div className="mt-1 text-[10px] text-[var(--text-dim)]">{timeOfDay(msg.created_at)}</div>
      </div>
    </div>
  );
}
