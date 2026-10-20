# Atomvo — Food and Fitness Tracker

A self-hosted, mobile-first food and fitness tracker. It's a PWA on **Cloudflare Workers**
(Hono API + React/Vite SPA, D1, R2), secured with **Cloudflare Access**.

- Log meals by photo, text, barcode or favourite. Cohere estimates calories and macros.
- An AI coach comments after each log, against a protein-first, adaptive calorie target.
- Weight and body composition come from manual entry, an Android Health Connect webhook,
  or a Wyze scale export (upload or email). Whoop data can be imported too.
- Gym tab: templates, live sessions, progress and muscle-balance views.

**Every deployment is your own.** You run it on your Cloudflare account with your own
Cohere key, and your data never leaves your account. There's no shared hosted service.

## Stack

| Piece | Choice |
|---|---|
| Runtime | Single Cloudflare Worker (`worker/index.ts`), `@cloudflare/vite-plugin` |
| API | Hono, routes in `worker/routes/*` |
| DB | D1 (`migrations/`) |
| Blobs | R2 (`PHOTOS`): meal photos, auto-purged after 30 days by cron |
| Frontend | React 18, React Router, TanStack Query, Recharts, Tailwind v4 |
| Auth | Cloudflare Access in front + in-Worker JWT verification (`worker/auth.ts`) |
| AI | Cohere v2 Chat with JSON-schema structured output (`worker/ai.ts`) |

## What you need

- A Cloudflare account with a domain on it (the free plan is enough for Workers, D1, R2 and Access
  for a few users).
- A [Cohere](https://cohere.com) API key. It's optional: without it, meal estimates come back blank
  for you to fill in by hand.
- Node 22+.

## Local development

```bash
npm install
cp wrangler.example.jsonc wrangler.jsonc         # placeholders are fine for local dev
cp .dev.vars.example .dev.vars                   # add COHERE_API_KEY to test AI locally
npm run db:migrate:local
npm run db:seed:local                            # optional demo data
npm run dev                                      # http://localhost:5173
```

With `DEV_BYPASS=1` in `.dev.vars`, requests to localhost skip Cloudflare Access and use a dev
identity. Requests to any other hostname never skip Access.

`npm run icons` regenerates `public/pwa/*` from `assets/icon-source.png`.
`VITE_APP_NAME` in `.env` (or a git-ignored `.env.local`) sets the app name.

## Deploying

### 1. Create the Cloudflare resources

```bash
npx wrangler login
npx wrangler d1 create food-tracker-db           # put the database_id into wrangler.jsonc
npx wrangler r2 bucket create food-tracker-photos
npx wrangler secret put COHERE_API_KEY
npx wrangler secret put INGEST_SHARED_SECRET     # a long random string
```

In `wrangler.jsonc`, set `routes` to your custom domain (it must be a zone on this account),
plus `APP_TIMEZONE`, `ALLOWED_EMAILS` and `OFF_CONTACT`.

### 2. Cloudflare Access (required)

Zero Trust → Access → Applications → Add → **Self-hosted**:

- Application domain: your custom domain.
- Policy: **Allow**, Include → Emails → your email.
- Copy the **Application Audience (AUD) tag** and your team domain
  (`https://<team>.cloudflareaccess.com`) into `ACCESS_AUD` / `ACCESS_TEAM_DOMAIN`.

Until both are set, the deployed Worker returns **503 on every `/api` call**. It won't serve
data without Access.

Also add **Bypass → Everyone** applications for `<domain>/pwa` (so the install manifest and
icons load), and for `<domain>/api/ingest` if you use the Health Connect webhook.

### 3a. Deploy from your machine

```bash
npm run db:migrate
npm run deploy
```

### 3b. Deploying with GitHub Actions

`.github/workflows/deploy.yml` deploys on every push to `main`. Your `wrangler.jsonc` is never
committed. Instead, the workflow writes it from a secret.

1. Create a Cloudflare API token with the **Edit Cloudflare Workers** template, plus
   **D1: Edit** permission.
2. In GitHub: Settings → Environments → create **`production`** and limit its deployment
   branches to `main`. Add these **environment secrets**:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `WRANGLER_CONFIG`: the full contents of your `wrangler.jsonc`
   - `DEPLOY_TARGETS`: the instances to deploy, for example
     ```json
     [{"env":"","name":"Atomvo"}]
     ```
     Add one entry for each wrangler environment you want deployed (see below). The workflow
     skips deploying until this secret is set, so forks never try to deploy.

If your repo is public, its Actions logs are public too. The workflow keeps instance names,
app names and wrangler output out of the logs unless a step fails. If a run fails, check its
log and delete the run if it shows anything you'd rather keep private.

Each run applies D1 migrations, builds and deploys every target. To change your config, update
the `WRANGLER_CONFIG` secret. Keep a copy of the file somewhere safe, because GitHub won't show
you the secret again.

## More than one person

Each person gets a fully isolated instance through a wrangler **environment**: their own Worker,
D1, R2, Access app and secrets, with no shared data. `wrangler.example.jsonc` has a commented
template.

1. Their domain must be an active zone on your Cloudflare account.
2. `npx wrangler d1 create food-tracker-<name>-db` and
   `npx wrangler r2 bucket create food-tracker-<name>-photos`, then fill in `env.<name>`.
3. Create an Access app for their domain (Allow → their email) and put the AUD in
   `env.<name>.vars.ACCESS_AUD`. Add the Bypass apps described in step 2 above.
4. Secrets: `npx cross-env CLOUDFLARE_ENV=<name> wrangler secret put COHERE_API_KEY` (and the
   same for `INGEST_SHARED_SECRET`).
5. Add `{"env":"<name>","name":"<App name>"}` to the `DEPLOY_TARGETS` secret. To deploy by hand instead,
   run `npx cross-env CLOUDFLARE_ENV=<name> VITE_APP_NAME="<App name>" npm run deploy`.

## Auto weight sync (Health Connect)

A PWA can't read Android Health Connect, so a small bridge app forwards the data.

1. Install **Health Connect Webhook** (`com.hcwebhook.app`,
   [source](https://github.com/mcnaveen/health-connect-webhook)).
2. Grant it Health Connect **read** access for Weight, Body Fat, Lean Body Mass, Active Calories,
   Total Calories, Steps and Basal Metabolic Rate.
3. Webhook URL: `https://<your-domain>/api/ingest/hc/<INGEST_SHARED_SECRET>`. Schedule it for
   08:00 and 21:00, or every 60 minutes.

The secret in the URL path is the credential, because the app can't send custom headers.

The Worker maps the data like this:
- `weight` / `body_fat` / `lean_body_mass` become `weights` rows. Body fat is paired with each
  weigh-in within ±5 minutes.
- `active_calories` / `total_calories` / `steps` / `basal_metabolic_rate` become one
  `daily_energy` row per tracking day. Under Settings → *Expenditure estimate*, choose
  **Tracked** to base the calorie target on the rolling average.

Records older than 14 days (weight) or 21 days (energy) are skipped. Re-sends are idempotent.

## Wyze scale import

Upload the Wyze `.xlsx` export in Settings, or email it to `scale@<your-domain>`. Email import
needs a Cloudflare Email Routing rule set to **Send to Worker**, and only accepts mail from Wyze
domains.

## Cron (UTC)

- `0 9 * * *`: daily adaptive-target recompute.
- `15 9 * * *`: delete R2 photos older than 30 days.

## Project layout

```
worker/            Hono API, auth, AI, cron, adaptive-target logic
  routes/          one file per resource
shared/types.ts    API contract shared with the client
src/               React app (screens/, components/, lib/)
migrations/        D1 schema
scripts/           icon generator, manifest patcher
```

## License

MIT. See [LICENSE](LICENSE). To report a security issue, see [SECURITY.md](SECURITY.md).
