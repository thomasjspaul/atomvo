import { Hono } from "hono";
import type { AppContext } from "../env";
import { buildStats } from "../service";

export const stats = new Hono<AppContext>();

// GET /api/stats?range=14|30|90
stats.get("/", async (c) => {
  const raw = Number(c.req.query("range") || "30");
  const range = [14, 30, 90].includes(raw) ? raw : 30;
  return c.json(await buildStats(c.env, range));
});
