// Turn assets/icon-source.png into the PWA icon set in public/pwa/.
// - trims the white page margin
// - center-crops just past the tile's rounded corners so the art is full-bleed
//   (no white showing when iOS/Android apply their own mask)
// - emits favicon, Android manifest icons, a maskable icon, and the iOS touch icon
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "assets/icon-source.png";
const OUT = "public/pwa";
mkdirSync(OUT, { recursive: true });

const trimmed = await sharp(SRC).trim({ background: "#ffffff", threshold: 28 }).toBuffer();
const meta = await sharp(trimmed).metadata();
const maxSide = Math.min(meta.width, meta.height);

function centeredExtract(size) {
  const left = Math.round((meta.width - size) / 2);
  const top = Math.round((meta.height - size) / 2);
  return sharp(trimmed).extract({ left, top, width: size, height: size });
}

async function cornersAreClean(size) {
  const raw = await centeredExtract(size).removeAlpha().resize(48, 48, { fit: "fill" }).raw().toBuffer();
  const at = (x, y) => [raw[(y * 48 + x) * 3], raw[(y * 48 + x) * 3 + 1], raw[(y * 48 + x) * 3 + 2]];
  const whitish = (p) => p[0] > 232 && p[1] > 232 && p[2] > 232;
  return ![at(0, 0), at(47, 0), at(0, 47), at(47, 47)].some(whitish);
}

// shrink the crop until the four corners land on the tile (not the white gaps)
let side = maxSide;
while (side > maxSide * 0.7 && !(await cornersAreClean(side))) side -= 8;

const master = await centeredExtract(side).resize(1024, 1024, { fit: "fill" }).png().toBuffer();

// sample the tile background colour from a top-centre pixel
const rawTop = await sharp(master).removeAlpha().resize(64, 64, { fit: "fill" }).raw().toBuffer();
const bg = { r: rawTop[32 * 3], g: rawTop[32 * 3 + 1], b: rawTop[32 * 3 + 2] };
console.log("crop side", side, "of", maxSide, "| tile bg", bg);

async function out(name, buf) {
  await sharp(buf).png().toFile(`${OUT}/${name}`);
  console.log("wrote", `${OUT}/${name}`);
}

// full-bleed square icons
await out("icon-1024.png", master);
await out("icon-512.png", await sharp(master).resize(512, 512).toBuffer());
await out("icon-192.png", await sharp(master).resize(192, 192).toBuffer());
await out("favicon-48.png", await sharp(master).resize(48, 48).toBuffer());

// iOS touch icon: opaque, 180, flattened onto the tile colour
await out(
  "apple-touch-icon.png",
  await sharp(master).flatten({ background: bg }).resize(180, 180).toBuffer(),
);

// maskable: art inside the safe zone (~80%), tile colour fills the rest
const inner = await sharp(master).resize(410, 410).toBuffer();
await out(
  "icon-maskable-512.png",
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: { ...bg, alpha: 1 } },
  })
    .composite([{ input: inner, gravity: "center" }])
    .png()
    .toBuffer(),
);
