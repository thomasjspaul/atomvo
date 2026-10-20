import type { Env } from "./env";
import { nowIso } from "./db";
import { recomputeTarget } from "./service";

const DAILY_RECOMPUTE = "0 9 * * *";
const DAILY_PURGE = "15 9 * * *";

export async function handleScheduled(event: ScheduledController, env: Env): Promise<void> {
  switch (event.cron) {
    case DAILY_RECOMPUTE:
      // Refresh today's target from the latest synced weight / BMR. No-op when unchanged.
      await recomputeTarget(env, "cron").catch((e) => console.error("recompute failed", e));
      return;
    case DAILY_PURGE:
      await purgeExpiredPhotos(env).catch((e) => console.error("purge failed", e));
      return;
    default:
      // If only one trigger fires in local testing, run both.
      await recomputeTarget(env, "cron").catch(() => null);
      await purgeExpiredPhotos(env).catch(() => null);
  }
}

export async function purgeExpiredPhotos(env: Env): Promise<number> {
  const now = nowIso();
  const rows = await env.DB.prepare(
    "SELECT id, photo_key FROM entries WHERE photo_key IS NOT NULL AND photo_expires_at IS NOT NULL AND photo_expires_at < ?",
  )
    .bind(now)
    .all<{ id: string; photo_key: string }>();

  for (const r of rows.results) {
    await env.PHOTOS.delete(r.photo_key).catch(() => null);
    await env.DB.prepare(
      "UPDATE entries SET photo_key = NULL, photo_expires_at = NULL WHERE id = ?",
    )
      .bind(r.id)
      .run();
  }
  return rows.results.length;
}
