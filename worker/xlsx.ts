import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

// Just enough .xlsx reading for the flat, single-sheet exports we ingest
// (Wyze scale). No number formats, no serial-date handling — callers get raw
// cell text and parse it themselves.
//
// Plus a minimal single-sheet .xlsx *writer* (sheetXlsx) for gym-progress
// exports — hand-templated OOXML zipped with fflate, inline strings only.

const unescapeXml = (s: string): string =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

function colIndex(ref: string): number {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Concatenate every <t>…</t> in a fragment (handles rich-text runs). */
function textNodes(fragment: string): string {
  let out = "";
  const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment))) out += m[1];
  return unescapeXml(out);
}

/** Rows of the first worksheet, row-major, as raw cell strings. */
export function readSheetRows(bytes: Uint8Array): string[][] {
  const files = unzipSync(bytes);
  const nameOf = (want: RegExp) => Object.keys(files).find((k) => want.test(k));

  const shared: string[] = [];
  const ssName = nameOf(/xl\/sharedStrings\.xml$/i);
  if (ssName) {
    const xml = strFromU8(files[ssName]);
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) shared.push(textNodes(m[1]));
  }

  const sheetName =
    nameOf(/xl\/worksheets\/sheet1\.xml$/i) ?? nameOf(/xl\/worksheets\/[^/]+\.xml$/i);
  if (!sheetName) return [];
  const xml = strFromU8(files[sheetName]);

  const rows: string[][] = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1];
      const inner = cm[2] ?? "";
      const refM = /\br="([A-Z]+\d+)"/.exec(attrs);
      const idx = refM ? colIndex(refM[1]) : cells.length;
      const t = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "";
      let val = "";
      if (inner.includes("<is>")) {
        val = textNodes(inner);
      } else {
        const raw = unescapeXml(/<v[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
        val = t === "s" ? (shared[Number(raw)] ?? "") : raw;
      }
      cells[idx] = val;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = "";
    rows.push(cells);
  }
  return rows;
}

// ---- writer -----------------------------------------------------------------

const xmlEsc = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
  );

/** 0-based column index → A1 column letters. */
function colLetters(n: number): string {
  let s = "";
  let x = n + 1;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function cell(ref: string, v: string | number): string {
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(
    v == null ? "" : String(v),
  )}</t></is></c>`;
}

/** Build a minimal one-sheet .xlsx. Text cells use inline strings (no sharedStrings). */
export function sheetXlsx(
  sheetName: string,
  headers: string[],
  rows: (string | number)[][],
): Uint8Array {
  const grid = [headers, ...rows];
  const sheetData = grid
    .map(
      (row, ri) =>
        `<row r="${ri + 1}">${row
          .map((v, ci) => cell(`${colLetters(ci)}${ri + 1}`, v))
          .join("")}</row>`,
    )
    .join("");
  const name = xmlEsc((sheetName || "Sheet1").replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData}</sheetData></worksheet>`,
    ),
  };
  return zipSync(files);
}
