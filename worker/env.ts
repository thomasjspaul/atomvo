export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ASSETS: Fetcher;

  APP_TIMEZONE: string;
  DAY_ROLLOVER_HOUR: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ALLOWED_EMAILS: string;
  COHERE_MODEL: string;
  /** Contact sent in the Open Food Facts User-Agent, as their API terms ask. */
  OFF_CONTACT?: string;

  // secrets (wrangler secret put ...)
  COHERE_API_KEY?: string;
  INGEST_SHARED_SECRET?: string;

  // local dev only (.dev.vars) — "1" skips Access on localhost
  DEV_BYPASS?: string;
}

export interface Identity {
  email: string;
  via: "access" | "dev-bypass";
}

export type AppContext = {
  Bindings: Env;
  Variables: { identity: Identity };
};
