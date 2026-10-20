import { Hono } from "hono";
import type { AppContext, Env } from "./env";
import { accessAuth, ingestAuth } from "./auth";
import { handleScheduled } from "./cron";
import { handleWyzeEmail } from "./email";

import { day } from "./routes/day";
import { meals } from "./routes/meals";
import { barcode } from "./routes/barcode";
import { stats } from "./routes/stats";
import { insights } from "./routes/insights";
import { favourites } from "./routes/favourites";
import { weights } from "./routes/weights";
import { targets } from "./routes/targets";
import { memory } from "./routes/memory";
import { settings } from "./routes/settings";
import { hydration } from "./routes/hydration";
import { whoopImport } from "./routes/import";
import { ingest, hcIngest } from "./routes/ingest";
import { gyms } from "./routes/gyms";
import { exercises } from "./routes/exercises";
import { workouts } from "./routes/workouts";
import { workoutTemplates } from "./routes/workout-templates";

const app = new Hono<AppContext>();

app.get("/api/health", (c) =>
  c.json({ ok: true, ai: Boolean(c.env.COHERE_API_KEY), time: new Date().toISOString() }),
);

// Health Connect webhook bridge — URL-token auth, no middleware. Must be
// registered before the /api/ingest sub-app and the Access-guarded /api.
app.route("/api/ingest/hc", hcIngest);

// Machine-to-machine ingest (X-Ingest-Secret header). Also before /api.
const ingestApp = new Hono<AppContext>();
ingestApp.use("*", ingestAuth);
ingestApp.route("/", ingest);
app.route("/api/ingest", ingestApp);

// Everything else under /api requires a valid Cloudflare Access identity.
const api = new Hono<AppContext>();
api.use("*", accessAuth);
api.route("/day", day);
api.route("/meals", meals);
api.route("/barcode", barcode);
api.route("/stats", stats);
api.route("/insights", insights);
api.route("/favourites", favourites);
api.route("/weights", weights);
api.route("/targets", targets);
api.route("/memory", memory);
api.route("/settings", settings);
api.route("/hydration", hydration);
api.route("/import", whoopImport);
api.route("/gyms", gyms);
api.route("/exercises", exercises);
api.route("/workouts", workouts);
api.route("/workout-templates", workoutTemplates);
api.get("/me", (c) => c.json({ identity: c.get("identity") }));
app.route("/api", api);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "not found" }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((err, c) => {
  console.error("unhandled", err);
  return c.json({ error: "internal error", detail: String(err?.message ?? err) }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(event, env));
  },
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      handleWyzeEmail(message, env).catch((e) => console.error("wyze email failed", e)),
    );
  },
} satisfies ExportedHandler<Env>;
