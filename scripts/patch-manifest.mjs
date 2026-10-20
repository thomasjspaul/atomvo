// Post-build: stamp the app name into the built PWA manifest.
// Vite already stamped %VITE_APP_NAME% into the built index.html <title> from the
// right .env / .env.<mode> file — mirror that so there's one source of truth.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const htmlPath = "dist/client/index.html";
const manifestPath = "dist/client/pwa/manifest.webmanifest";

if (!existsSync(manifestPath)) {
  console.warn(`patch-manifest: ${manifestPath} not found (run vite build first) — skipped`);
  process.exit(0);
}

let name = process.env.VITE_APP_NAME || "";
if (!name && existsSync(htmlPath)) {
  const m = readFileSync(htmlPath, "utf8").match(/<title>([^<]*)<\/title>/i);
  if (m && m[1] && !m[1].includes("%")) name = m[1].trim();
}
name = name || "Atomvo";

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.name = name;
manifest.short_name = name;
manifest.build_id =
  process.env.WORKERS_CI_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  new Date().toISOString();
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`patch-manifest: name -> ${name}, build_id -> ${manifest.build_id}`);
