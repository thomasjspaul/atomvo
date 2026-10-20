export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : fallback;
}

export function optNum(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : null;
}

export function bool(v: unknown): boolean {
  return v === true || v === "true" || v === "1" || v === 1;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Durable lookup key for an exercise name. Lower-cases, folds all punctuation
 * (hyphens, slashes, apostrophes…) to single spaces, collapses whitespace, and
 * drops a leading "the ". Deliberately minimal — no stemming or plural folding;
 * canonicalise-on-select routes most entries through the catalog anyway.
 */
export function normalizeExerciseName(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

export function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("heic")) return "heic";
  return "jpg";
}
