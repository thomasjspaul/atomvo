import { Hono } from "hono";
import type { AppContext } from "../env";
import type { BarcodeLookup, Macros } from "../../shared/types";
import { optNum, round1 } from "../util";

export const barcode = new Hono<AppContext>();

const OFF_FIELDS =
  "product_name,generic_name,brands,nutriments,serving_size,serving_quantity,image_front_small_url";
const CACHE_TTL_MS = 30 * 86_400_000;

type Nutriments = Record<string, unknown>;

function macroFrom(n: Nutriments, suffix: "100g" | "serving"): Macros | null {
  const kcal = optNum(n[`energy-kcal_${suffix}`]);
  const kj = optNum(n[`energy-kj_${suffix}`]);
  const calories = kcal ?? (kj != null ? kj / 4.184 : null);
  const protein = optNum(n[`proteins_${suffix}`]);
  const carbs = optNum(n[`carbohydrates_${suffix}`]);
  const fat = optNum(n[`fat_${suffix}`]);
  if (calories == null && protein == null && carbs == null && fat == null) return null;
  return {
    calories: round1(calories ?? 0),
    protein_g: round1(protein ?? 0),
    carbs_g: round1(carbs ?? 0),
    fat_g: round1(fat ?? 0),
  };
}

function scale(m: Macros, factor: number): Macros {
  return {
    calories: round1(m.calories * factor),
    protein_g: round1(m.protein_g * factor),
    carbs_g: round1(m.carbs_g * factor),
    fat_g: round1(m.fat_g * factor),
  };
}

function normalize(code: string, product: Record<string, unknown>): BarcodeLookup | null {
  const n = (product.nutriments as Nutriments) ?? {};
  const per100 = macroFrom(n, "100g");
  if (!per100) return null; // nothing usable

  const brand =
    typeof product.brands === "string" && product.brands.trim()
      ? product.brands.split(",")[0].trim()
      : null;
  const name =
    (typeof product.product_name === "string" && product.product_name.trim()) ||
    (typeof product.generic_name === "string" && product.generic_name.trim()) ||
    (brand ? `${brand} product` : code);

  const servingG = optNum(product.serving_quantity);
  const servingLabel =
    typeof product.serving_size === "string" && product.serving_size.trim()
      ? product.serving_size.trim()
      : null;
  const perServing =
    macroFrom(n, "serving") ?? (servingG ? scale(per100, servingG / 100) : null);

  return {
    found: true,
    code,
    name,
    brand,
    serving_g: servingG,
    serving_label: servingLabel,
    per_100g: per100,
    per_serving: perServing,
    image_url:
      typeof product.image_front_small_url === "string" ? product.image_front_small_url : null,
  };
}

// GET /api/barcode/:code  — Open Food Facts lookup, cached in D1 (incl. misses).
barcode.get("/:code", async (c) => {
  const code = (c.req.param("code") || "").trim();
  if (!/^\d{8,14}$/.test(code)) return c.json({ error: "invalid barcode", code }, 400);

  const cached = await c.env.DB.prepare(
    "SELECT found, payload, fetched_at FROM barcode_cache WHERE code = ?",
  )
    .bind(code)
    .first<{ found: number; payload: string | null; fetched_at: string }>();

  if (cached && Date.now() - Date.parse(cached.fetched_at) < CACHE_TTL_MS) {
    if (!cached.found) return c.json({ error: "not found", code }, 404);
    return c.json(JSON.parse(cached.payload!) as BarcodeLookup);
  }

  let result: BarcodeLookup | null = null;
  let definitiveMiss = false;
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`,
      {
        headers: {
          "User-Agent": `Atomvo/1.0 (${c.env.OFF_CONTACT || "self-hosted"})`,
          Accept: "application/json",
        },
      },
    );
    if (res.ok) {
      const body = (await res.json()) as {
        status?: number;
        product?: Record<string, unknown>;
      };
      if (body.status === 1 && body.product) result = normalize(code, body.product);
      if (!result) definitiveMiss = true; // OFF answered: no product, or nothing usable
    }
  } catch {
    // network / OFF down — transient, don't cache
  }

  if (!result) {
    if (definitiveMiss) {
      await c.env.DB.prepare(
        `INSERT INTO barcode_cache (code, found, payload, fetched_at) VALUES (?, 0, NULL, ?)
         ON CONFLICT (code) DO UPDATE SET found = 0, payload = NULL, fetched_at = excluded.fetched_at`,
      )
        .bind(code, new Date().toISOString())
        .run();
    }
    return c.json({ error: definitiveMiss ? "not found" : "lookup unavailable", code }, 404);
  }

  await c.env.DB.prepare(
    `INSERT INTO barcode_cache (code, found, payload, fetched_at) VALUES (?, 1, ?, ?)
     ON CONFLICT (code) DO UPDATE SET found = 1, payload = excluded.payload, fetched_at = excluded.fetched_at`,
  )
    .bind(code, JSON.stringify(result), new Date().toISOString())
    .run();

  return c.json(result);
});
