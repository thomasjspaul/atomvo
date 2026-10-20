import PostalMime from "postal-mime";
import type { Env } from "./env";
import { importWyze } from "./wyze";

// The address is single-purpose and unpublished; accept the Wyze export sender
// or any Wyze-owned domain (incl. subdomains like bounce.wyze.com).
const ALLOWED_DOMAINS = ["wyze.com", "wyzecam.com", "wyzelabs.com"];

/** Pull the bare address out of `From` (handles `Display Name <addr@x>`). */
function bareAddress(raw: string): string {
  const s = (raw || "").trim();
  const m = /<([^>]+)>/.exec(s);
  return (m ? m[1] : s).trim().toLowerCase();
}

const isAllowedSender = (from: string) => {
  if (from === "wyzescale@wyze.com") return true;
  const domain = from.split("@").pop() ?? "";
  return ALLOWED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
};

function toBytes(content: unknown): Uint8Array | null {
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (content instanceof Uint8Array) return content;
  if (typeof content === "string") {
    // base64
    try {
      const bin = atob(content);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Cloudflare Email Routing target for the Wyze scale export. Accepts mail from a
 * wyze.com address, parses the .xlsx attachment, and runs the same import as
 * POST /api/import/wyze.
 */
export async function handleWyzeEmail(
  message: ForwardableEmailMessage,
  env: Env,
): Promise<void> {
  // message.from is the envelope sender (Wyze relays via Amazon SES, so that's an
  // amazonses.com address); the real sender is in the From: header.
  const envFrom = bareAddress(message.from);
  const hdrFrom = bareAddress(message.headers.get("from") || "");
  console.log(
    "wyze email:",
    JSON.stringify({ envFrom, hdrFrom, to: message.to, size: message.rawSize }),
  );
  if (!isAllowedSender(envFrom) && !isAllowedSender(hdrFrom)) {
    console.warn("wyze email: sender not allowed:", message.from, "/", message.headers.get("from"));
    message.setReject("sender not allowed");
    return;
  }

  const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
  const parsed = await PostalMime.parse(raw);
  const atts = parsed.attachments ?? [];
  console.log(
    "wyze email attachments:",
    JSON.stringify(atts.map((a) => ({ name: a.filename, mime: a.mimeType }))),
  );
  const att = atts.find(
    (a) =>
      /\.xlsx?$/i.test(a.filename || "") ||
      /spreadsheet|excel|officedocument\.spreadsheetml/i.test(a.mimeType || ""),
  );
  if (!att) {
    console.warn("wyze email: no spreadsheet attachment");
    return;
  }
  const bytes = toBytes(att.content);
  if (!bytes) {
    console.warn("wyze email: could not decode attachment");
    return;
  }

  const result = await importWyze(env, bytes);
  console.log("wyze email import:", JSON.stringify(result));
}
