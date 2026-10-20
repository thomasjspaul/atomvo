import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AppContext, Env } from "./env";

function allowedEmails(env: Env): string[] {
  return (env.ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function parseCookie(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

let jwksCache: JWTVerifyGetKey | null = null;
let jwksIssuer = "";

/**
 * Verifies the Cloudflare Access JWT (defence in depth — Access already blocks
 * unauthenticated requests at the edge). When ACCESS_TEAM_DOMAIN / ACCESS_AUD are
 * unset (local dev) the check is skipped and a dev identity is used.
 */
export const accessAuth = createMiddleware<AppContext>(async (c, next) => {
  const env = c.env;
  const rawDomain = (env.ACCESS_TEAM_DOMAIN || "").trim().replace(/\/+$/, "");
  const aud = (env.ACCESS_AUD || "").trim();

  // `wrangler dev` has no Access in front, so a local request can never carry a
  // valid Access JWT. Bypass only when DEV_BYPASS=1 (set in the git-ignored
  // .dev.vars, never in wrangler.jsonc) AND the request is for a local host —
  // a Host header alone is not trusted, and a stray DEV_BYPASS in production
  // still can't open the real hostname.
  const host = (c.req.header("host") || "").toLowerCase();
  const isLocal =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("0.0.0.0") ||
    host.startsWith("192.168.") ||
    host.startsWith("[::1]") ||
    host.endsWith(".local");
  if (env.DEV_BYPASS === "1" && isLocal) {
    c.set("identity", { email: allowedEmails(env)[0] ?? "dev@localhost", via: "dev-bypass" });
    return next();
  }

  if (!rawDomain || !aud) {
    // Deployed but Access not wired up yet — fail closed rather than serve openly.
    return c.json(
      { error: "Cloudflare Access is not configured (set ACCESS_TEAM_DOMAIN and ACCESS_AUD)" },
      503,
    );
  }

  const issuer = rawDomain.startsWith("http") ? rawDomain : `https://${rawDomain}`;
  const token =
    c.req.header("Cf-Access-Jwt-Assertion") ||
    parseCookie(c.req.header("Cookie") || "")["CF_Authorization"] ||
    "";
  if (!token) return c.json({ error: "missing Access token" }, 401);

  try {
    if (!jwksCache || jwksIssuer !== issuer) {
      jwksCache = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      jwksIssuer = issuer;
    }
    const { payload } = await jwtVerify(token, jwksCache, { issuer, audience: aud });
    const email = String(payload.email ?? "").toLowerCase();
    const allow = allowedEmails(env);
    if (allow.length > 0 && !allow.includes(email)) {
      return c.json({ error: "not authorised" }, 403);
    }
    c.set("identity", { email: email || "unknown", via: "access" });
    return next();
  } catch {
    return c.json({ error: "invalid Access token" }, 401);
  }
});

/** Length-independent constant-time-ish string compare. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Machine-to-machine auth for `POST /api/ingest/weight` (curl / manual testing).
 * Checks the `X-Ingest-Secret` header. The Health Connect webhook app can't send
 * headers — it uses the URL-token route instead (see routes/ingest.ts).
 */
export const ingestAuth = createMiddleware<AppContext>(async (c, next) => {
  const expected = c.env.INGEST_SHARED_SECRET;
  const got = c.req.header("X-Ingest-Secret") || "";
  if (!expected) return c.json({ error: "ingest not configured (set INGEST_SHARED_SECRET)" }, 503);
  if (!timingSafeEqual(got, expected)) return c.json({ error: "forbidden" }, 403);
  c.set("identity", { email: "ingest", via: "dev-bypass" });
  return next();
});
