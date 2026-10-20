import { Hono } from "hono";
import type { AppContext } from "../env";
import type { Entry, EstimatedItem, LogMealResponse } from "../../shared/types";
import {
  effectiveTimezone,
  genId,
  getActiveTarget,
  getSettings,
  nowIso,
  rolloverHour,
  rowToCoach,
  rowToEntry,
} from "../db";
import { hoursLeftInDay, localParts, trackingDate } from "../time";
import { estimateMeal, coachFeedback } from "../ai";
import { activeMemoryTexts, dayTotals, recentSummary } from "../service";
import { arrayBufferToBase64, bool, extFromMime, num } from "../util";

export const meals = new Hono<AppContext>();

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const THIRTY_DAYS_MS = 30 * 86_400_000;

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function insertEntry(
  c: { env: AppContext["Bindings"] },
  row: Record<string, unknown>,
): Promise<Entry> {
  await c.env.DB.prepare(
    `INSERT INTO entries
       (id, occurred_at, tracking_date, source, title, user_text, photo_key, photo_expires_at,
        calories, protein_g, carbs_g, fat_g, creatine_g, confidence, items_json, assumptions, ai_raw_json, edited, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      row.id,
      row.occurred_at,
      row.tracking_date,
      row.source,
      row.title,
      row.user_text,
      row.photo_key,
      row.photo_expires_at,
      row.calories,
      row.protein_g,
      row.carbs_g,
      row.fat_g,
      row.creatine_g ?? null,
      row.confidence,
      row.items_json,
      row.assumptions,
      row.ai_raw_json,
      row.edited ?? 0,
      row.created_at,
      row.updated_at,
    )
    .run();
  const fresh = await c.env.DB.prepare("SELECT * FROM entries WHERE id = ?")
    .bind(row.id)
    .first<Record<string, unknown>>();
  return rowToEntry(fresh!);
}

// POST /api/meals  — multipart (photo + text) or JSON ({ text })
meals.post("/", async (c) => {
  const s = await getSettings(c.env);
  const tz = effectiveTimezone(c.env, s);
  const roll = rolloverHour(c.env, s);
  const ct = c.req.header("Content-Type") || "";

  let text: string | null = null;
  let occurredAtInput: string | null = null;
  let photoBytes: ArrayBuffer | null = null;
  let photoMime = "image/jpeg";
  let knownItems: EstimatedItem[] = [];
  let creatineInput: string | null = null;

  const parseKnown = (v: unknown): EstimatedItem[] => {
    const raw = typeof v === "string" ? safeJson(v) : v;
    return Array.isArray(raw) ? (raw as EstimatedItem[]).slice(0, 20) : [];
  };

  if (ct.includes("multipart/form-data")) {
    const body = await c.req.parseBody();
    text = (body.text as string) || null;
    occurredAtInput = (body.occurred_at as string) || null;
    knownItems = parseKnown(body.known_items);
    creatineInput = (body.creatine_g as string) || null;
    const f = body.photo;
    if (f instanceof File && f.size > 0) {
      if (f.size > MAX_PHOTO_BYTES) return c.json({ error: "photo too large (max 8MB)" }, 413);
      photoBytes = await f.arrayBuffer();
      photoMime = f.type || "image/jpeg";
    }
  } else {
    const body = await c.req.json<{
      text?: string;
      occurred_at?: string;
      known_items?: unknown;
      creatine_g?: number | string;
    }>();
    text = body.text ?? null;
    occurredAtInput = body.occurred_at ?? null;
    knownItems = parseKnown(body.known_items);
    creatineInput = body.creatine_g != null ? String(body.creatine_g) : null;
  }
  const creatineG = creatineInput != null && creatineInput.trim() !== "" ? Math.max(0, num(creatineInput)) : null;

  if (!text?.trim() && !photoBytes && !knownItems.length) {
    return c.json({ error: "provide a photo, a description, or a scanned item" }, 400);
  }

  const id = genId();
  const occurredAt = occurredAtInput ? new Date(occurredAtInput).toISOString() : nowIso();
  const tDate = trackingDate(new Date(occurredAt), tz, roll);

  // store the photo
  let photoKey: string | null = null;
  let photoExpires: string | null = null;
  let imageDataUrl: string | null = null;
  if (photoBytes) {
    const ext = extFromMime(photoMime);
    photoKey = `meals/${tDate.slice(0, 7)}/${id}.${ext}`;
    await c.env.PHOTOS.put(photoKey, photoBytes, { httpMetadata: { contentType: photoMime } });
    photoExpires = new Date(Date.now() + THIRTY_DAYS_MS).toISOString();
    imageDataUrl = `data:${photoMime};base64,${arrayBufferToBase64(photoBytes)}`;
  }

  const memory = await activeMemoryTexts(c.env);
  const est = await estimateMeal(c.env, {
    text,
    imageDataUrl,
    memory,
    model: s.cohere_model,
    knownItems,
  });

  const entry = await insertEntry(c, {
    id,
    occurred_at: occurredAt,
    tracking_date: tDate,
    source: photoKey ? "photo" : text?.trim() ? "text" : "barcode",
    title: est.title,
    user_text: text,
    photo_key: photoKey,
    photo_expires_at: photoExpires,
    calories: est.totals.calories,
    protein_g: est.totals.protein_g,
    carbs_g: est.totals.carbs_g,
    fat_g: est.totals.fat_g,
    creatine_g: creatineG,
    confidence: est.configured ? est.confidence : null,
    items_json: JSON.stringify(est.items),
    assumptions: est.assumptions,
    ai_raw_json: JSON.stringify({ needs_clarification: est.needs_clarification }),
    created_at: nowIso(),
    updated_at: nowIso(),
  });

  let coachMessage: LogMealResponse["coach_message"] = null;
  let memorySuggestion: LogMealResponse["memory_suggestion"] = null;

  // coach feedback (best-effort) — skipped entirely when the coach is turned off
  const coachOn = s.coach_style !== "off";
  const totals = coachOn ? await dayTotals(c.env, tDate) : null;
  const coach = coachOn
    ? await coachFeedback(c.env, {
        model: s.cohere_model,
        goal: s.goal,
        coachStyle: s.coach_style,
        focusMode: s.focus_mode,
        localTime: (() => {
          const lp = localParts(new Date(), tz);
          return `${String(lp.hour).padStart(2, "0")}:${String(lp.minute).padStart(2, "0")}`;
        })(),
        hoursLeft: hoursLeftInDay(new Date(), tz, roll),
        totals: totals!,
        calorieTarget: (await getActiveTarget(c.env, tDate))?.calorie_target ?? null,
        proteinTarget: (await getActiveTarget(c.env, tDate))?.protein_target_g ?? null,
        recentSummary: await recentSummary(c.env, tDate),
        memory,
        justLogged: `${est.title} — ${Math.round(est.totals.calories)} kcal / ${Math.round(est.totals.protein_g)} g protein`,
      })
    : null;

  if (coach?.message) {
    const cid = genId();
    await c.env.DB.prepare(
      "INSERT INTO coach_messages (id, entry_id, tracking_date, text, model, context_json, created_at) VALUES (?,?,?,?,?,?,?)",
    )
      .bind(cid, id, tDate, coach.message, s.cohere_model, JSON.stringify({ totals }), nowIso())
      .run();
    const row = await c.env.DB.prepare("SELECT * FROM coach_messages WHERE id = ?")
      .bind(cid)
      .first<Record<string, unknown>>();
    coachMessage = rowToCoach(row!);
  }

  if (coach?.memory_suggestion) {
    const mid = genId();
    await c.env.DB.prepare(
      "INSERT INTO memory_notes (id, text, category, status, origin, source_entry_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
    )
      .bind(mid, coach.memory_suggestion, null, "suggested", "ai", id, nowIso(), nowIso())
      .run();
    memorySuggestion = {
      id: mid,
      text: coach.memory_suggestion,
      category: null,
      status: "suggested",
      origin: "ai",
      source_entry_id: id,
      created_at: nowIso(),
    };
  }

  // Note: "save as favourite" is handled by the client after the user reviews /
  // edits the estimate, so it captures the final numbers (POST /api/favourites).

  return c.json<LogMealResponse>({
    entry,
    coach_message: coachMessage,
    memory_suggestion: memorySuggestion,
  });
});

// GET /api/meals?date=YYYY-MM-DD
meals.get("/", async (c) => {
  const s = await getSettings(c.env);
  const tz = effectiveTimezone(c.env, s);
  const date =
    c.req.query("date") || trackingDate(new Date(), tz, rolloverHour(c.env, s));
  const rows = await c.env.DB.prepare(
    "SELECT * FROM entries WHERE tracking_date = ? ORDER BY occurred_at",
  )
    .bind(date)
    .all<Record<string, unknown>>();
  return c.json({ date, entries: rows.results.map(rowToEntry) });
});

meals.get("/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM entries WHERE id = ?")
    .bind(c.req.param("id"))
    .first<Record<string, unknown>>();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(rowToEntry(row));
});

// GET /api/meals/:id/photo  — proxied through the Worker so it stays behind Access
meals.get("/:id/photo", async (c) => {
  const row = await c.env.DB.prepare("SELECT photo_key FROM entries WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ photo_key: string | null }>();
  if (!row?.photo_key) return c.json({ error: "no photo" }, 404);
  const obj = await c.env.PHOTOS.get(row.photo_key);
  if (!obj) return c.json({ error: "photo purged" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "image/jpeg",
      "Cache-Control": "private, max-age=86400",
    },
  });
});

// PATCH /api/meals/:id
meals.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM entries WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!existing) return c.json({ error: "not found" }, 404);

  const body = await c.req.json<Record<string, unknown>>();
  const s = await getSettings(c.env);
  const tz = effectiveTimezone(c.env, s);
  const roll = rolloverHour(c.env, s);

  const patch: Record<string, unknown> = { updated_at: nowIso(), edited: 1 };

  if (body.title !== undefined) patch.title = String(body.title);
  if (body.user_text !== undefined) patch.user_text = body.user_text ? String(body.user_text) : null;
  if (body.occurred_at !== undefined) {
    const iso = new Date(String(body.occurred_at)).toISOString();
    patch.occurred_at = iso;
    patch.tracking_date = trackingDate(new Date(iso), tz, roll);
  }
  for (const k of ["calories", "protein_g", "carbs_g", "fat_g"] as const) {
    if (body[k] !== undefined) patch[k] = Math.max(0, num(body[k]));
  }
  if (body.creatine_g !== undefined) {
    patch.creatine_g = body.creatine_g === null ? null : Math.max(0, num(body.creatine_g));
  }
  if (Array.isArray(body.items)) patch.items_json = JSON.stringify(body.items);

  if (bool(body.reestimate)) {
    const textForAi = (patch.user_text as string) ?? (existing.user_text as string) ?? null;
    const photoKey = existing.photo_key as string | null;
    let imageDataUrl: string | null = null;
    if (photoKey) {
      const obj = await c.env.PHOTOS.get(photoKey);
      if (obj) {
        const buf = await obj.arrayBuffer();
        const mime = obj.httpMetadata?.contentType || "image/jpeg";
        imageDataUrl = `data:${mime};base64,${arrayBufferToBase64(buf)}`;
      }
    }
    const est = await estimateMeal(c.env, {
      text: textForAi,
      imageDataUrl,
      memory: await activeMemoryTexts(c.env),
      model: s.cohere_model,
    });
    patch.title = est.title;
    patch.calories = est.totals.calories;
    patch.protein_g = est.totals.protein_g;
    patch.carbs_g = est.totals.carbs_g;
    patch.fat_g = est.totals.fat_g;
    patch.confidence = est.configured ? est.confidence : null;
    patch.items_json = JSON.stringify(est.items);
    patch.assumptions = est.assumptions;
  }

  const cols = Object.keys(patch);
  await c.env.DB.prepare(`UPDATE entries SET ${cols.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .bind(...cols.map((k) => patch[k]), id)
    .run();

  const fresh = await c.env.DB.prepare("SELECT * FROM entries WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json(rowToEntry(fresh!));
});

meals.post("/:id/reestimate", async (c) => {
  // delegate to PATCH with reestimate flag
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT id FROM entries WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "not found" }, 404);
  const s = await getSettings(c.env);
  const row = await c.env.DB.prepare("SELECT * FROM entries WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  const photoKey = row!.photo_key as string | null;
  let imageDataUrl: string | null = null;
  if (photoKey) {
    const obj = await c.env.PHOTOS.get(photoKey);
    if (obj) {
      const buf = await obj.arrayBuffer();
      const mime = obj.httpMetadata?.contentType || "image/jpeg";
      imageDataUrl = `data:${mime};base64,${arrayBufferToBase64(buf)}`;
    }
  }
  const est = await estimateMeal(c.env, {
    text: (row!.user_text as string) ?? null,
    imageDataUrl,
    memory: await activeMemoryTexts(c.env),
    model: s.cohere_model,
  });
  await c.env.DB.prepare(
    `UPDATE entries SET title=?, calories=?, protein_g=?, carbs_g=?, fat_g=?, confidence=?, items_json=?, assumptions=?, edited=1, updated_at=? WHERE id=?`,
  )
    .bind(
      est.title,
      est.totals.calories,
      est.totals.protein_g,
      est.totals.carbs_g,
      est.totals.fat_g,
      est.configured ? est.confidence : null,
      JSON.stringify(est.items),
      est.assumptions,
      nowIso(),
      id,
    )
    .run();
  const fresh = await c.env.DB.prepare("SELECT * FROM entries WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json(rowToEntry(fresh!));
});

meals.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT photo_key FROM entries WHERE id = ?")
    .bind(id)
    .first<{ photo_key: string | null }>();
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.photo_key) await c.env.PHOTOS.delete(row.photo_key);
  await c.env.DB.prepare("DELETE FROM coach_messages WHERE entry_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM entries WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});
